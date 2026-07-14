import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/groupAuth.js';
import {
  enqueueSettlementOptimization,
  getCachedSettlementPlan,
} from '../queue/settlementQueue.js';
import { completeSettlementLogic } from './payments.js';
import {
  validateUUID,
  validatePositiveAmount,
  validateOptionalString,
  validateEnum,
} from '../lib/validate.js';

const router = Router({ mergeParams: true });

interface SettlementRow {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: string;
  currency: string;
  status: string;
  payment_reference: string | null;
  payment_method: string | null;
  settled_at: string | null;
  created_at: string;
}

function settlementToResponse(s: SettlementRow): Record<string, unknown> {
  return {
    id: s.id,
    groupId: s.group_id,
    fromUser: s.from_user,
    toUser: s.to_user,
    amount: parseFloat(s.amount),
    currency: s.currency,
    status: s.status,
    paymentReference: s.payment_reference,
    paymentMethod: s.payment_method,
    settledAt: s.settled_at,
    createdAt: s.created_at,
  };
}

router.get('/optimize', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const cachedPlan = await getCachedSettlementPlan(groupId);

    if (!cachedPlan) {
      await enqueueSettlementOptimization(groupId);
      res.json({
        status: 'success',
        data: {
          plan: [],
          cached: false,
          message: 'Settlement optimization is queued. Retry shortly.',
        },
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        plan: cachedPlan,
        cached: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const fromUser = req.auth!.userId;

    const toUser = validateUUID(req.body.toUser, 'toUser');
    const amount = validatePositiveAmount(req.body.amount);
    const currency = validateOptionalString(req.body.currency, 3, 'currency') ?? 'INR';
    const paymentMethod = validateOptionalString(req.body.paymentMethod, 50, 'paymentMethod');
    const paymentReference = validateOptionalString(req.body.paymentReference, 255, 'paymentReference');

    if (fromUser === toUser) {
      throw new AppError('Cannot settle with yourself', 400);
    }

    const memberCheck = await query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, toUser],
    );
    if (memberCheck.rows.length === 0) {
      throw new AppError('Recipient is not a member of this group', 400);
    }

    const inserted = await query<SettlementRow>(
      `INSERT INTO settlements (group_id, from_user, to_user, amount, currency, payment_method, payment_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [groupId, fromUser, toUser, amount, currency, paymentMethod, paymentReference],
    );

    const settlement = inserted.rows[0];

    res.status(201).json({
      status: 'success',
      data: { settlement: settlementToResponse(settlement) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;

    const result = await query<SettlementRow>(
      `SELECT s.*, 
              uf.display_name AS from_display_name, uf.username AS from_username,
              ut.display_name AS to_display_name, ut.username AS to_username
       FROM settlements s
       JOIN users uf ON uf.id = s.from_user
       JOIN users ut ON ut.id = s.to_user
       WHERE s.group_id = $1
       ORDER BY s.created_at DESC`,
      [groupId],
    );

    res.json({
      status: 'success',
      data: { settlements: result.rows.map(settlementToResponse) },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:settlementId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const settlementId = validateUUID(req.params['settlementId'], 'settlementId');
    const status = validateEnum(req.body.status, ['completed', 'failed'] as const, 'status');

    const existing = await query<SettlementRow>(
      `SELECT * FROM settlements WHERE id = $1 AND group_id = $2`,
      [settlementId, groupId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('Settlement not found', 404);
    }

    if (existing.rows[0].status !== 'pending') {
      throw new AppError('Settlement has already been resolved', 400);
    }

    // Only the involved users or admin can update
    const isInvolved = existing.rows[0].from_user === req.auth!.userId ||
      existing.rows[0].to_user === req.auth!.userId;

    if (!isInvolved && req.groupMembership!.role !== 'admin') {
      throw new AppError('Only involved parties or group admin can update settlement status', 403);
    }

    if (status === 'completed') {
      const paymentMethod = validateOptionalString(req.body.paymentMethod, 50, 'paymentMethod') ?? 'manual';
      const paymentReference = validateOptionalString(req.body.paymentReference, 255, 'paymentReference') ?? undefined;

      await completeSettlementLogic(settlementId, paymentMethod, paymentReference);
    } else {
      await query<SettlementRow>(
        `UPDATE settlements SET status = 'failed', settled_at = NULL WHERE id = $1`,
        [settlementId],
      );

      await enqueueSettlementOptimization(groupId);
    }

    const updated = await query<SettlementRow>(
      `SELECT * FROM settlements WHERE id = $1`,
      [settlementId],
    );

    res.json({
      status: 'success',
      data: { settlement: settlementToResponse(updated.rows[0]) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
