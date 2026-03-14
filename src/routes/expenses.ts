import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { withTransaction, txQuery } from '../db/helpers.js';
import { AppError, SplitMethod } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/groupAuth.js';
import { redis } from '../redis/client.js';
import { enqueueSettlementOptimization } from '../queue/settlementQueue.js';
import { anchorExpense, anchorLedgerEntry } from '../lib/blockchainClient.js';
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

interface LedgerEntryRow {
  account_id: string;
  amount: string;
  entry_type: string;
}

interface MemberRow {
  user_id: string;
}

interface ExpenseListRow extends ExpenseRow {
  paid_by_username: string;
  paid_by_display_name: string;
}

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

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

function expenseListToResponse(e: ExpenseListRow): Record<string, unknown> {
  return {
    ...expenseToResponse(e),
    paidByUser: {
      id: e.paid_by,
      username: e.paid_by_username,
      displayName: e.paid_by_display_name,
    },
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

function parseSplitInput(raw: unknown): SplitInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const userIdRaw = item['userId'] ?? item['user_id'];
    const userId = validateUUID(userIdRaw, 'splits[].userId');

    const owedAmountRaw = item['owedAmount'] ?? item['owed_amount'];
    const percentageRaw = item['percentage'];

    return {
      userId,
      owedAmount: owedAmountRaw === undefined ? undefined : validatePositiveAmount(owedAmountRaw, 'splits[].owedAmount'),
      percentage: percentageRaw === undefined ? undefined : Number(percentageRaw),
    };
  });
}

function parseSplitType(rawBody: Record<string, unknown>): SplitMethod {
  const splitTypeRaw = rawBody['splitType'] ?? rawBody['split_type'];
  return validateEnum(splitTypeRaw, ['equal', 'percentage', 'custom'] as const, 'splitType') as SplitMethod;
}

function parsePaidBy(rawBody: Record<string, unknown>, fallbackUserId: string): string {
  const paidByRaw = rawBody['paidBy'] ?? rawBody['paid_by'];
  if (paidByRaw === undefined || paidByRaw === null || String(paidByRaw).trim().length === 0) {
    return fallbackUserId;
  }

  return validateUUID(paidByRaw, 'paidBy');
}

function currencyToPaisa(amount: number): number {
  return Math.round(amount * 100);
}

function paisaToCurrency(paisa: number): number {
  return Math.round((paisa / 100) * 100) / 100;
}

function ensureUniqueParticipants(splits: SplitInput[]): void {
  const seen = new Set<string>();
  for (const split of splits) {
    if (seen.has(split.userId)) {
      throw new AppError(`Duplicate participant in splits: ${split.userId}`, 400);
    }
    seen.add(split.userId);
  }
}

function calculateSplits(
  amount: number,
  splitType: SplitMethod,
  splits: SplitInput[],
  memberIds: string[],
): Array<{ userId: string; owedAmount: number; percentage: number | null }> {
  ensureUniqueParticipants(splits);

  if (splitType === SplitMethod.EQUAL) {
    const participants = splits.length > 0 ? splits.map((s) => s.userId) : memberIds;
    if (participants.length === 0) {
      throw new AppError('At least one participant is required for splitting', 400);
    }

    const totalPaisa = currencyToPaisa(amount);
    const basePaisa = Math.floor(totalPaisa / participants.length);
    const remainderPaisa = totalPaisa - basePaisa * participants.length;

    return participants.map((userId, index) => {
      const owedPaisa = basePaisa + (index < remainderPaisa ? 1 : 0);
      return { userId, owedAmount: paisaToCurrency(owedPaisa), percentage: null };
    });
  }

  if (splitType === SplitMethod.PERCENTAGE) {
    if (splits.length === 0) {
      throw new AppError('Splits with percentages are required for percentage split', 400);
    }

    for (const split of splits) {
      if (split.percentage === undefined || Number.isNaN(split.percentage) || split.percentage <= 0) {
        throw new AppError('Each percentage split must provide a positive percentage value', 400);
      }
    }

    const totalPercentage = splits.reduce((sum, s) => sum + (s.percentage ?? 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new AppError('Percentages must sum to 100', 400);
    }

    const totalPaisa = currencyToPaisa(amount);
    let allocatedPaisa = 0;

    return splits.map((s, index) => {
      const pct = s.percentage ?? 0;
      const isLast = index === splits.length - 1;
      const sharePaisa = isLast
        ? totalPaisa - allocatedPaisa
        : Math.round((totalPaisa * pct) / 100);

      allocatedPaisa += sharePaisa;

      return {
        userId: s.userId,
        owedAmount: paisaToCurrency(sharePaisa),
        percentage: pct,
      };
    });
  }

  if (splitType === SplitMethod.CUSTOM) {
    if (splits.length === 0) {
      throw new AppError('Splits with amounts are required for custom split', 400);
    }
    const totalPaisa = currencyToPaisa(amount);
    const totalOwedPaisa = splits.reduce((sum, s) => sum + currencyToPaisa(s.owedAmount ?? 0), 0);

    if (totalOwedPaisa !== totalPaisa) {
      throw new AppError(`Split amounts must sum to the total expense amount (${amount})`, 400);
    }

    return splits.map((s) => ({
      userId: s.userId,
      owedAmount: paisaToCurrency(currencyToPaisa(s.owedAmount ?? 0)),
      percentage: null,
    }));
  }

  throw new AppError('Invalid split type', 400);
}

function getIdempotencyRedisKey(groupId: string, userId: string, key: string): string {
  return `idempotency:expense:${groupId}:${userId}:${key}`;
}

async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const membersResult = await query<MemberRow>(
    `SELECT user_id FROM group_members WHERE group_id = $1`,
    [groupId],
  );

  return membersResult.rows.map((m) => m.user_id);
}

async function getOrCreateLedgerAccountId(
  client: Parameters<typeof txQuery>[0],
  groupId: string,
  userId: string,
  type: 'user_payable' | 'user_receivable',
): Promise<string> {
  const found = await txQuery<{ id: string }>(
    client,
    `SELECT id FROM ledger_accounts WHERE group_id = $1 AND user_id = $2 AND type = $3 LIMIT 1`,
    [groupId, userId, type],
  );

  if (found.rows.length > 0) {
    return found.rows[0].id;
  }

  const inserted = await txQuery<{ id: string }>(
    client,
    `INSERT INTO ledger_accounts (group_id, user_id, type)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [groupId, userId, type],
  );

  return inserted.rows[0].id;
}

async function writeExpenseLedgerEntries(
  client: Parameters<typeof txQuery>[0],
  groupId: string,
  expenseId: string,
  paidBy: string,
  computedSplits: Array<{ userId: string; owedAmount: number; percentage: number | null }>,
): Promise<void> {
  for (const split of computedSplits) {
    if (split.userId === paidBy) {
      continue;
    }

    const receivableAccountId = await getOrCreateLedgerAccountId(client, groupId, paidBy, 'user_receivable');
    const payableAccountId = await getOrCreateLedgerAccountId(client, groupId, split.userId, 'user_payable');

    await txQuery(
      client,
      `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type)
       VALUES ($1, $2, 'expense', $3, 'credit')`,
      [receivableAccountId, expenseId, split.owedAmount],
    );

    await txQuery(
      client,
      `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type)
       VALUES ($1, $2, 'expense', $3, 'debit')`,
      [payableAccountId, expenseId, split.owedAmount],
    );

    await txQuery(client, `UPDATE ledger_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [
      split.owedAmount,
      receivableAccountId,
    ]);
    await txQuery(client, `UPDATE ledger_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [
      split.owedAmount,
      payableAccountId,
    ]);
  }
}

async function reverseExpenseLedgerEntries(
  client: Parameters<typeof txQuery>[0],
  expenseId: string,
): Promise<void> {
  const ledgerEntries = await txQuery<LedgerEntryRow>(
    client,
    `SELECT account_id, amount, entry_type
     FROM ledger_entries
     WHERE reference_id = $1 AND reference_type = 'expense'`,
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

    await txQuery(
      client,
      `UPDATE ledger_accounts SET current_balance = current_balance - $1 WHERE id = $2`,
      [parseFloat(entry.amount), entry.account_id],
    );
  }
}

async function loadExpenseInGroup(expenseId: string, groupId: string): Promise<ExpenseRow> {
  const result = await query<ExpenseRow>(
    `SELECT * FROM expenses WHERE id = $1 AND group_id = $2 AND is_deleted = false`,
    [expenseId, groupId],
  );

  if (result.rows.length === 0) {
    throw new AppError('Expense not found', 404);
  }

  return result.rows[0];
}


router.post('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const requestUserId = req.auth!.userId;
    const payload = req.body as Record<string, unknown>;

    const amount = validatePositiveAmount(payload.amount);
    const description = validateRequired(payload.description, 'description');
    const splitType = parseSplitType(payload);
    const category = validateOptionalString(payload.category, 50, 'category');
    const receiptUrl = validateOptionalString(payload.receiptUrl ?? payload.receipt_url, 2000, 'receiptUrl');
    const expenseDate = validateRequired(payload.expenseDate ?? payload.expense_date ?? new Date().toISOString().split('T')[0], 'expenseDate');
    const currency = validateOptionalString(payload.currency, 3, 'currency') ?? 'INR';
    const paidBy = parsePaidBy(payload, requestUserId);
    const splitsInput = parseSplitInput(payload.splits);

    const memberIds = await getGroupMemberIds(groupId);
    if (!memberIds.includes(paidBy)) {
      throw new AppError('paidBy must be a group member', 400);
    }

    const computedSplits = calculateSplits(amount, splitType, splitsInput, memberIds);

    for (const split of computedSplits) {
      if (!memberIds.includes(split.userId)) {
        throw new AppError(`User ${split.userId} is not a member of this group`, 400);
      }
    }

    const idempotencyKeyHeader = req.header('Idempotency-Key')?.trim() ?? '';
    let idempotencyRedisKey: string | null = null;
    let idempotencyClaimed = false;

    try {
      if (idempotencyKeyHeader.length > 0) {
        if (idempotencyKeyHeader.length > 128) {
          throw new AppError('Idempotency-Key must be 128 characters or less', 400);
        }

        idempotencyRedisKey = getIdempotencyRedisKey(groupId, requestUserId, idempotencyKeyHeader);
        const claimResult = await redis.set(idempotencyRedisKey, 'PENDING', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');

        if (claimResult !== 'OK') {
          const existingReference = await redis.get(idempotencyRedisKey);

          if (existingReference && existingReference !== 'PENDING') {
            const existingExpenseResult = await query<ExpenseRow>(
              `SELECT * FROM expenses WHERE id = $1 AND group_id = $2 AND is_deleted = false`,
              [existingReference, groupId],
            );

            if (existingExpenseResult.rows.length > 0) {
              res.json({
                status: 'success',
                data: {
                  expense: expenseToResponse(existingExpenseResult.rows[0]),
                  idempotentReplay: true,
                },
              });
              return;
            }
          }

          throw new AppError('Duplicate request is already in progress', 409);
        }

        idempotencyClaimed = true;
      }

      const expense = await withTransaction(async (client) => {
        const inserted = await txQuery<ExpenseRow>(
          client,
          `INSERT INTO expenses (group_id, paid_by, amount, currency, description, category, split_type, receipt_url, expense_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [groupId, paidBy, amount, currency, description, category, splitType, receiptUrl, expenseDate],
        );

        const expenseRow = inserted.rows[0];

        for (const split of computedSplits) {
          await txQuery(
            client,
            `INSERT INTO expense_splits (expense_id, user_id, owed_amount, percentage)
             VALUES ($1, $2, $3, $4)`,
            [expenseRow.id, split.userId, split.owedAmount, split.percentage],
          );
        }

        await writeExpenseLedgerEntries(client, groupId, expenseRow.id, paidBy, computedSplits);

        await txQuery(
          client,
          `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
           VALUES ($1, $2, 'expense_added', $3)`,
          [groupId, requestUserId, JSON.stringify({ expenseId: expenseRow.id, amount, description })],
        );

        return expenseRow;
      });

      if (idempotencyRedisKey) {
        await redis.set(idempotencyRedisKey, expense.id, 'EX', IDEMPOTENCY_TTL_SECONDS);
      }

      await enqueueSettlementOptimization(groupId);

      const expenseDateTextResult = await query<{ expense_date: string }>(
        `SELECT expense_date::text AS expense_date FROM expenses WHERE id = $1`,
        [expense.id],
      );
      const expenseDateText = expenseDateTextResult.rows[0]?.expense_date ?? String(expense.expense_date);

      // Anchor expense on blockchain (fire-and-forget)
      anchorExpense({
        id: expense.id,
        groupId,
        paidByUserId: expense.paid_by,
        amount: expense.amount,
        currency: expense.currency,
        category: expense.category ?? '',
        description: expense.description,
        expenseDate: expenseDateText,
      });

      // Anchor ledger entries on blockchain (fire-and-forget)
      const ledgerRows = await query<{ id: string; group_id: string; account_id: string; reference_id: string; reference_type: string; amount: string; entry_type: string }>(
        `SELECT le.id, la.group_id, le.account_id, le.reference_id, le.reference_type, le.amount::text, le.entry_type
         FROM ledger_entries le
         JOIN ledger_accounts la ON la.id = le.account_id
         WHERE le.reference_id = $1 AND le.reference_type = 'expense'`,
        [expense.id],
      );
      for (const row of ledgerRows.rows) {
        anchorLedgerEntry({
          id: row.id,
          groupId: row.group_id,
          accountId: row.account_id,
          referenceId: row.reference_id,
          referenceType: row.reference_type,
          amount: row.amount,
          entryType: row.entry_type,
        });
      }

      res.status(201).json({
        status: 'success',
        data: { expense: expenseToResponse(expense) },
      });
    } catch (err) {
      if (idempotencyClaimed && idempotencyRedisKey) {
        await redis.del(idempotencyRedisKey);
      }

      throw err;
    }
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

    const result = await query<ExpenseListRow>(
      `SELECT e.*, u.username AS paid_by_username, u.display_name AS paid_by_display_name
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
      WHERE e.group_id = $1 AND e.is_deleted = false
      ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );

    res.json({
      status: 'success',
      data: {
        expenses: result.rows.map(expenseListToResponse),
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

router.put('/:expenseId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const expenseId = validateUUID(req.params['expenseId'], 'expenseId');
    const requestUserId = req.auth!.userId;
    const payload = req.body as Record<string, unknown>;

    const existing = await loadExpenseInGroup(expenseId, groupId);

    if (existing.paid_by !== requestUserId && req.groupMembership!.role !== 'admin') {
      throw new AppError('Only the payer or group admin can update this expense', 403);
    }

    const amount = validatePositiveAmount(payload.amount);
    const description = validateRequired(payload.description, 'description');
    const splitType = parseSplitType(payload);
    const category = validateOptionalString(payload.category, 50, 'category');
    const receiptUrl = validateOptionalString(payload.receiptUrl ?? payload.receipt_url, 2000, 'receiptUrl');
    const expenseDate = validateRequired(payload.expenseDate ?? payload.expense_date ?? existing.expense_date, 'expenseDate');
    const currency = validateOptionalString(payload.currency, 3, 'currency') ?? existing.currency;
    const paidBy = parsePaidBy(payload, existing.paid_by);
    const splitsInput = parseSplitInput(payload.splits);

    const memberIds = await getGroupMemberIds(groupId);
    if (!memberIds.includes(paidBy)) {
      throw new AppError('paidBy must be a group member', 400);
    }

    const computedSplits = calculateSplits(amount, splitType, splitsInput, memberIds);

    for (const split of computedSplits) {
      if (!memberIds.includes(split.userId)) {
        throw new AppError(`User ${split.userId} is not a member of this group`, 400);
      }
    }

    const updatedExpense = await withTransaction(async (client) => {
      await reverseExpenseLedgerEntries(client, expenseId);

      await txQuery(client, `DELETE FROM expense_splits WHERE expense_id = $1`, [expenseId]);

      const updated = await txQuery<ExpenseRow>(
        client,
        `UPDATE expenses
         SET paid_by = $1,
             amount = $2,
             currency = $3,
             description = $4,
             category = $5,
             split_type = $6,
             receipt_url = $7,
             expense_date = $8,
             updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [paidBy, amount, currency, description, category, splitType, receiptUrl, expenseDate, expenseId],
      );

      for (const split of computedSplits) {
        await txQuery(
          client,
          `INSERT INTO expense_splits (expense_id, user_id, owed_amount, percentage)
           VALUES ($1, $2, $3, $4)`,
          [expenseId, split.userId, split.owedAmount, split.percentage],
        );
      }

      await writeExpenseLedgerEntries(client, groupId, expenseId, paidBy, computedSplits);

      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'expense_updated', $3)`,
        [groupId, requestUserId, JSON.stringify({ expenseId })],
      );

      return updated.rows[0];
    });

    await enqueueSettlementOptimization(groupId);

    // Anchor updated ledger entries on blockchain (fire-and-forget)
    const ledgerRows = await query<{ id: string; group_id: string; account_id: string; reference_id: string; reference_type: string; amount: string; entry_type: string }>(
      `SELECT le.id, la.group_id, le.account_id, le.reference_id, le.reference_type, le.amount::text, le.entry_type
       FROM ledger_entries le
       JOIN ledger_accounts la ON la.id = le.account_id
       WHERE le.reference_id = $1 AND le.reference_type = 'expense'`,
      [expenseId],
    );
    for (const row of ledgerRows.rows) {
      anchorLedgerEntry({
        id: row.id,
        groupId: row.group_id,
        accountId: row.account_id,
        referenceId: row.reference_id,
        referenceType: row.reference_type,
        amount: row.amount,
        entryType: row.entry_type,
      });
    }

    res.json({
      status: 'success',
      data: { expense: expenseToResponse(updatedExpense) },
    });
  } catch (err) {
    next(err);
  }
});


router.delete('/:expenseId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const expenseId = validateUUID(req.params['expenseId'], 'expenseId');
    const userId = req.auth!.userId;

    const existing = await loadExpenseInGroup(expenseId, groupId);

    if (existing.paid_by !== userId && req.groupMembership!.role !== 'admin') {
      throw new AppError('Only the payer or group admin can delete this expense', 403);
    }

    await withTransaction(async (client) => {
      await txQuery(client, `UPDATE expenses SET is_deleted = true, updated_at = NOW() WHERE id = $1`, [expenseId]);

      await reverseExpenseLedgerEntries(client, expenseId);

      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'expense_deleted', $3)`,
        [groupId, userId, JSON.stringify({ expenseId, amount: existing.amount })],
      );
    });

    await enqueueSettlementOptimization(groupId);

    res.json({ status: 'success', message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
