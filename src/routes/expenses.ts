import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { withTransaction, txQuery } from '../db/helpers.js';
import { AppError, SplitMethod } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/groupAuth.js';
import {
  validateRequired,
  validatePositiveAmount,
  validateEnum,
  validateOptionalString,
  validateUUID,
  validatePagination,
} from '../lib/validate.js';

const router = Router({ mergeParams: true });

interface ExpenseRow {
  id: string;
  group_id: string;
  paid_by: string;
  amount: string;
  currency: string;
  description: string;
  category: string | null;
  split_type: string;
  receipt_url: string | null;
  expense_date: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface SplitRow {
  id: string;
  expense_id: string;
  user_id: string;
  owed_amount: string;
  percentage: string | null;
  is_settled: boolean;
}

interface SplitInput {
  userId: string;
  owedAmount?: number;
  percentage?: number;
}

function expenseToResponse(e: ExpenseRow): Record<string, unknown> {
  return {
    id: e.id,
    groupId: e.group_id,
    paidBy: e.paid_by,
    amount: parseFloat(e.amount),
    currency: e.currency,
    description: e.description,
    category: e.category,
    splitType: e.split_type,
    receiptUrl: e.receipt_url,
    expenseDate: e.expense_date,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

function splitToResponse(s: SplitRow): Record<string, unknown> {
  return {
    id: s.id,
    userId: s.user_id,
    owedAmount: parseFloat(s.owed_amount),
    percentage: s.percentage ? parseFloat(s.percentage) : null,
    isSettled: s.is_settled,
  };
}

function calculateSplits(
  amount: number,
  splitType: SplitMethod,
  splits: SplitInput[],
  memberIds: string[],
): Array<{ userId: string; owedAmount: number; percentage: number | null }> {
  if (splitType === SplitMethod.EQUAL) {
    const participants = splits.length > 0 ? splits.map((s) => s.userId) : memberIds;
    if (participants.length === 0) {
      throw new AppError('At least one participant is required for splitting', 400);
    }
    const perPerson = Math.round((amount / participants.length) * 100) / 100;

    let running = 0;
    return participants.map((userId, i) => {
      const isLast = i === participants.length - 1;
      const owed = isLast ? Math.round((amount - running) * 100) / 100 : perPerson;
      running += owed;
      return { userId, owedAmount: owed, percentage: null };
    });
  }

  if (splitType === SplitMethod.PERCENTAGE) {
    if (splits.length === 0) {
      throw new AppError('Splits with percentages are required for percentage split', 400);
    }
    const totalPercentage = splits.reduce((sum, s) => sum + (s.percentage ?? 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new AppError('Percentages must sum to 100', 400);
    }
    return splits.map((s) => {
      const pct = s.percentage ?? 0;
      return {
        userId: s.userId,
        owedAmount: Math.round(amount * (pct / 100) * 100) / 100,
        percentage: pct,
      };
    });
  }

  if (splitType === SplitMethod.CUSTOM) {
    if (splits.length === 0) {
      throw new AppError('Splits with amounts are required for custom split', 400);
    }
    const totalOwed = splits.reduce((sum, s) => sum + (s.owedAmount ?? 0), 0);
    if (Math.abs(totalOwed - amount) > 0.01) {
      throw new AppError(`Split amounts must sum to the total expense amount (${amount})`, 400);
    }
    return splits.map((s) => ({
      userId: s.userId,
      owedAmount: Math.round((s.owedAmount ?? 0) * 100) / 100,
      percentage: null,
    }));
  }

  throw new AppError('Invalid split type', 400);
}


router.post('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const paidBy = req.auth!.userId;

    const amount = validatePositiveAmount(req.body.amount);
    const description = validateRequired(req.body.description, 'description');
    const splitType = validateEnum(req.body.splitType, ['equal', 'percentage', 'custom'] as const, 'splitType') as SplitMethod;
    const category = validateOptionalString(req.body.category, 50, 'category');
    const receiptUrl = validateOptionalString(req.body.receiptUrl, 2000, 'receiptUrl');
    const expenseDate = validateRequired(req.body.expenseDate || new Date().toISOString().split('T')[0], 'expenseDate');
    const currency = validateOptionalString(req.body.currency, 3, 'currency') ?? 'INR';
    const splitsInput: SplitInput[] = Array.isArray(req.body.splits) ? req.body.splits : [];

    for (const s of splitsInput) {
      validateUUID(s.userId, 'splits[].userId');
    }

    const membersResult = await query<{ user_id: string }>(
      `SELECT user_id FROM group_members WHERE group_id = $1`,
      [groupId],
    );
    const memberIds = membersResult.rows.map((m) => m.user_id);

    const computedSplits = calculateSplits(amount, splitType, splitsInput, memberIds);

    for (const s of computedSplits) {
      if (!memberIds.includes(s.userId)) {
        throw new AppError(`User ${s.userId} is not a member of this group`, 400);
      }
    }

    const expense = await withTransaction(async (client) => {

      const inserted = await txQuery<ExpenseRow>(
        client,
        `INSERT INTO expenses (group_id, paid_by, amount, currency, description, category, split_type, receipt_url, expense_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [groupId, paidBy, amount, currency, description, category, splitType, receiptUrl, expenseDate],
      );

      const exp = inserted.rows[0];

      for (const s of computedSplits) {
        await txQuery(
          client,
          `INSERT INTO expense_splits (expense_id, user_id, owed_amount, percentage)
           VALUES ($1, $2, $3, $4)`,
          [exp.id, s.userId, s.owedAmount, s.percentage],
        );
      }

      for (const s of computedSplits) {
        if (s.userId === paidBy) continue;

        const payerAccount = await txQuery<{ id: string }>(
          client,
          `SELECT id FROM ledger_accounts WHERE group_id = $1 AND user_id = $2 AND type = 'user_receivable'`,
          [groupId, paidBy],
        );

        if (payerAccount.rows.length > 0) {
          await txQuery(client, `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type) VALUES ($1, $2, 'expense', $3, 'credit')`, [payerAccount.rows[0].id, exp.id, s.owedAmount]);
          await txQuery(client, `UPDATE ledger_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [s.owedAmount, payerAccount.rows[0].id]);
        }

        // Get/create payable account for the debtor
        const debtorAccount = await txQuery<{ id: string }>(
          client,
          `SELECT id FROM ledger_accounts WHERE group_id = $1 AND user_id = $2 AND type = 'user_payable'`,
          [groupId, s.userId],
        );

        if (debtorAccount.rows.length > 0) {
          await txQuery(client, `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type) VALUES ($1, $2, 'expense', $3, 'debit')`, [debtorAccount.rows[0].id, exp.id, s.owedAmount]);
          await txQuery(client, `UPDATE ledger_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [s.owedAmount, debtorAccount.rows[0].id]);
        }
      }

      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'expense_added', $3)`,
        [groupId, paidBy, JSON.stringify({ expenseId: exp.id, amount, description })],
      );

      return exp;
    });

    res.status(201).json({
      status: 'success',
      data: { expense: expenseToResponse(expense) },
    });
  } catch (err) {
    next(err);
  }
});


router.get('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const { limit, offset } = validatePagination(req.query as Record<string, unknown>);

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM expenses WHERE group_id = $1 AND is_deleted = false`,
      [groupId],
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query<ExpenseRow>(
      `SELECT * FROM expenses
       WHERE group_id = $1 AND is_deleted = false
       ORDER BY expense_date DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );

    res.json({
      status: 'success',
      data: {
        expenses: result.rows.map(expenseToResponse),
        pagination: { total, limit, offset },
      },
    });
  } catch (err) {
    next(err);
  }
});


router.get('/:expenseId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const expenseId = validateUUID(req.params['expenseId'], 'expenseId');

    const expResult = await query<ExpenseRow>(
      `SELECT * FROM expenses WHERE id = $1 AND group_id = $2 AND is_deleted = false`,
      [expenseId, groupId],
    );

    if (expResult.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    const splitsResult = await query<SplitRow>(
      `SELECT es.*, u.username, u.display_name
       FROM expense_splits es
       JOIN users u ON u.id = es.user_id
       WHERE es.expense_id = $1`,
      [expenseId],
    );

    const expense = expenseToResponse(expResult.rows[0]);
    expense.splits = splitsResult.rows.map(splitToResponse);

    res.json({ status: 'success', data: { expense } });
  } catch (err) {
    next(err);
  }
});


router.patch('/:expenseId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const expenseId = validateUUID(req.params['expenseId'], 'expenseId');
    const userId = req.auth!.userId;

    const existing = await query<ExpenseRow>(
      `SELECT * FROM expenses WHERE id = $1 AND group_id = $2 AND is_deleted = false`,
      [expenseId, groupId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    if (existing.rows[0].paid_by !== userId && req.groupMembership!.role !== 'admin') {
      throw new AppError('Only the payer or group admin can update this expense', 403);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (req.body.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(validateRequired(req.body.description, 'description'));
    }
    if (req.body.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.category, 50, 'category'));
    }
    if (req.body.receiptUrl !== undefined) {
      fields.push(`receipt_url = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.receiptUrl, 2000, 'receiptUrl'));
    }
    if (req.body.expenseDate !== undefined) {
      fields.push(`expense_date = $${paramIndex++}`);
      values.push(validateRequired(req.body.expenseDate, 'expenseDate'));
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    fields.push(`updated_at = NOW()`);
    values.push(expenseId);

    const updated = await query<ExpenseRow>(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    // Log activity
    await query(
      `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
       VALUES ($1, $2, 'expense_updated', $3)`,
      [groupId, userId, JSON.stringify({ expenseId })],
    );

    res.json({ status: 'success', data: { expense: expenseToResponse(updated.rows[0]) } });
  } catch (err) {
    next(err);
  }
});


router.delete('/:expenseId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const expenseId = validateUUID(req.params['expenseId'], 'expenseId');
    const userId = req.auth!.userId;

    const existing = await query<ExpenseRow>(
      `SELECT * FROM expenses WHERE id = $1 AND group_id = $2 AND is_deleted = false`,
      [expenseId, groupId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    if (existing.rows[0].paid_by !== userId && req.groupMembership!.role !== 'admin') {
      throw new AppError('Only the payer or group admin can delete this expense', 403);
    }

    await withTransaction(async (client) => {
      
      await txQuery(client, `UPDATE expenses SET is_deleted = true, updated_at = NOW() WHERE id = $1`, [expenseId]);

      const ledgerEntries = await txQuery<{ account_id: string; amount: string; entry_type: string }>(
        client,
        `SELECT account_id, amount, entry_type FROM ledger_entries WHERE reference_id = $1 AND reference_type = 'expense'`,
        [expenseId],
      );

      for (const entry of ledgerEntries.rows) {
        const reverseType = entry.entry_type === 'debit' ? 'credit' : 'debit';
        await txQuery(
          client,
          `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type)
           VALUES ($1, $2, 'refund', $3, $4)`,
          [entry.account_id, expenseId, entry.amount, reverseType],
        );

        const sign = entry.entry_type === 'debit' ? -1 : 1;
        await txQuery(
          client,
          `UPDATE ledger_accounts SET current_balance = current_balance - $1 WHERE id = $2`,
          [parseFloat(entry.amount) * sign, entry.account_id],
        );
      }
      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'expense_deleted', $3)`,
        [groupId, userId, JSON.stringify({ expenseId, amount: existing.rows[0].amount })],
      );
    });

    res.json({ status: 'success', message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
