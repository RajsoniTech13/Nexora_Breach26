import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyExpense, verifyLedgerEntry, verifySettlement } from '../lib/blockchainClient.js';
import { validateUUID } from '../lib/validate.js';
import { AppError } from '../types/index.js';

const router = Router();


/*
==========================
VERIFY EXPENSE
==========================
Takes an expense ID, fetches the data from DB,
sends it to the blockchain service for verification.
*/

router.post('/verify-expense', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const expenseId = validateUUID(req.body.expenseId, 'expenseId');

    const result = await query<{
      id: string;
      group_id: string;
      paid_by: string;
      amount: string;
      currency: string;
      category: string | null;
      description: string;
      expense_date: string;
    }>(
      `SELECT id, group_id, paid_by, amount::text, currency, category, description, expense_date::text
       FROM expenses WHERE id = $1 AND is_deleted = false`,
      [expenseId],
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    const row = result.rows[0];
    const blockchainResult = await verifyExpense({
      id: row.id,
      groupId: row.group_id,
      paidByUserId: row.paid_by,
      amount: row.amount,
      currency: row.currency,
      category: row.category ?? '',
      description: row.description,
      expenseDate: row.expense_date,
    });

    res.json({
      status: 'success',
      data: {
        expenseId: row.id,
        blockchain: blockchainResult,
      },
    });
  } catch (err) {
    next(err);
  }
});


/*
==========================
VERIFY LEDGER ENTRY
==========================
Takes a ledger entry ID, fetches the data from DB,
sends it to the blockchain service for verification.
*/

router.post('/verify-ledger', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const entryId = validateUUID(req.body.entryId, 'entryId');

    const result = await query<{
      id: string;
      group_id: string;
      account_id: string;
      reference_id: string;
      reference_type: string;
      amount: string;
      entry_type: string;
    }>(
      `SELECT le.id, la.group_id, le.account_id, le.reference_id, le.reference_type, le.amount::text, le.entry_type
       FROM ledger_entries le
       JOIN ledger_accounts la ON la.id = le.account_id
       WHERE le.id = $1`,
      [entryId],
    );

    if (result.rows.length === 0) {
      throw new AppError('Ledger entry not found', 404);
    }

    const row = result.rows[0];
    const blockchainResult = await verifyLedgerEntry({
      id: row.id,
      groupId: row.group_id,
      accountId: row.account_id,
      referenceId: row.reference_id,
      referenceType: row.reference_type,
      amount: row.amount,
      entryType: row.entry_type,
    });

    res.json({
      status: 'success',
      data: {
        entryId: row.id,
        blockchain: blockchainResult,
      },
    });
  } catch (err) {
    next(err);
  }
});


/*
==========================
VERIFY SETTLEMENT
==========================
Takes a settlement ID, fetches the data from DB,
sends it to the blockchain service for verification.
*/

router.post('/verify-settlement', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const settlementId = validateUUID(req.body.settlementId, 'settlementId');

    const result = await query<{
      id: string;
      group_id: string;
      from_user: string;
      to_user: string;
      amount: string;
      currency: string;
      settled_at: string | null;
    }>(
      `SELECT id, group_id, from_user, to_user, amount::text, currency, settled_at::text AS settled_at
       FROM settlements WHERE id = $1`,
      [settlementId],
    );

    if (result.rows.length === 0) {
      throw new AppError('Settlement not found', 404);
    }

    const row = result.rows[0];
    const blockchainResult = await verifySettlement({
      id: row.id,
      groupId: row.group_id,
      fromUserId: row.from_user,
      toUserId: row.to_user,
      amount: row.amount,
      currency: row.currency,
      settledAt: row.settled_at ?? '',
    });

    res.json({
      status: 'success',
      data: {
        settlementId: row.id,
        blockchain: blockchainResult,
      },
    });
  } catch (err) {
    next(err);
  }
});


export default router;
