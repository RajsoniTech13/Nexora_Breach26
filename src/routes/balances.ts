import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/groupAuth.js';

const router = Router({ mergeParams: true });

interface BalanceRow {
  user_id: string;
  username: string;
  display_name: string;
  upi_id: string | null;
  avatar_url: string | null;
  payable: string;
  receivable: string;
}

interface DebtEdge {//added upiID field here 
  from: { id: string; username: string; displayName: string; upiId: string | null };
  to: { id: string; username: string; displayName: string; upiId: string | null };
  amount: number;
}

function simplifyDebts(//added upiID field here
  balances: Map<string, { net: number; username: string; displayName: string; upiId: string | null; avatarUrl: string | null }>,
): DebtEdge[] {
  const positives: Array<{ id: string; amount: number; username: string; displayName: string; upiId: string | null }> = [];
  const negatives: Array<{ id: string; amount: number; username: string; displayName: string; upiId: string | null }> = [];

  for (const [id, info] of balances.entries()) {
    const net = Math.round(info.net * 100) / 100;
    if (net > 0.01) {
      positives.push({ id, amount: net, username: info.username, displayName: info.displayName, upiId: info.upiId });
    } else if (net < -0.01) {
      negatives.push({ id, amount: -net, username: info.username, displayName: info.displayName, upiId: info.upiId });
    }
  }

  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  const result: DebtEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < positives.length && j < negatives.length) {
    const creditor = positives[i];
    const debtor = negatives[j];
    const transferAmount = Math.round(Math.min(creditor.amount, debtor.amount) * 100) / 100;

    result.push({//added UPI id here 
      from: { id: debtor.id, username: debtor.username, displayName: debtor.displayName, upiId: debtor.upiId },
      to: { id: creditor.id, username: creditor.username, displayName: creditor.displayName, upiId: creditor.upiId },
      amount: transferAmount,
    });

    creditor.amount = Math.round((creditor.amount - transferAmount) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - transferAmount) * 100) / 100;

    if (creditor.amount < 0.01) i++;
    if (debtor.amount < 0.01) j++;
  }

  return result;
}

router.get('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;


    const result = await query<BalanceRow>(
      `SELECT 
         gm.user_id,
         u.username,
         u.display_name,
         u.upi_id,
         u.avatar_url,
         COALESCE(lp.current_balance, 0)::text AS payable,
         COALESCE(lr.current_balance, 0)::text AS receivable
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN ledger_accounts lp ON lp.group_id = gm.group_id AND lp.user_id = gm.user_id AND lp.type = 'user_payable'
       LEFT JOIN ledger_accounts lr ON lr.group_id = gm.group_id AND lr.user_id = gm.user_id AND lr.type = 'user_receivable'
       WHERE gm.group_id = $1`,
      [groupId],
    );

    const balances = new Map<string, { net: number; username: string; displayName: string; upiId: string | null; avatarUrl: string | null }>();

    for (const row of result.rows) {
      const receivable = parseFloat(row.receivable);
      const payable = parseFloat(row.payable);
      const net = receivable - payable;

      balances.set(row.user_id, {
        net,
        username: row.username,
        displayName: row.display_name,
        upiId: row.upi_id,
        avatarUrl: row.avatar_url,
      });
    }

    const debts = simplifyDebts(balances);

    const memberBalances = result.rows.map((row) => {
      const info = balances.get(row.user_id)!;
      return {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        netBalance: Math.round(info.net * 100) / 100,
        isOwed: info.net > 0,
        owes: info.net < 0,
      };
    });

    res.json({
      status: 'success',
      data: {
        balances: memberBalances,
        simplifiedDebts: debts,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
