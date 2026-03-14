import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db/pool.js';
import { withTransaction, txQuery } from '../db/helpers.js';
import { AppError } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/groupAuth.js';
import { validateUUID } from '../lib/validate.js';
import { enqueueSettlementOptimization } from '../queue/settlementQueue.js';

const router = Router({ mergeParams: true });

function getStripeClient(): Stripe {
  const stripeSecretKey = process.env['STRIPE_SECRET_KEY'];
  if (!stripeSecretKey) {
    throw new AppError('Stripe is not configured', 503);
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: '2026-02-25.clover',
  });
}

interface SettlementRow {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: string;
  currency: string;
  status: string;
}

/**
 * Helper to execute the core logic of settling a debt (shared by Stripe Webhook and Mark Cash)
 */
export async function completeSettlementLogic(
  settlementId: string,
  paymentMethod: string,
  paymentReference?: string
): Promise<void> {
  const existing = await query<SettlementRow>(`SELECT * FROM settlements WHERE id = $1`, [settlementId]);

  if (existing.rows.length === 0) {
    throw new AppError('Settlement not found', 404);
  }

  const settlement = existing.rows[0];

  if (settlement.status === 'completed') {
    return;
  }

  if (settlement.status !== 'pending') {
    throw new AppError('Settlement cannot be completed from current state', 400);
  }

  await withTransaction(async (client) => {
    // 1. Mark settlement complete
    await txQuery(
      client,
      `UPDATE settlements
       SET status = 'completed',
           payment_method = $1,
           payment_reference = $2,
           settled_at = NOW()
       WHERE id = $3`,
      [paymentMethod, paymentReference || null, settlementId]
    );

    // 2. Clear out the corresponding payable and receivable ledger entries
    // For a settlement: 
    // The "from_user" pays the "to_user".
    // "from_user" has a payable balance. We DEBIT payable to reduce the debt.
    // "to_user" has a receivable balance. We CREDIT receivable to reduce what they are owed.

    const fromPayableIdResult = await txQuery<{ id: string }>(
      client,
      `SELECT id FROM ledger_accounts WHERE group_id = $1 AND user_id = $2 AND type = 'user_payable'`,
      [settlement.group_id, settlement.from_user]
    );

    const toReceivableIdResult = await txQuery<{ id: string }>(
      client,
      `SELECT id FROM ledger_accounts WHERE group_id = $1 AND user_id = $2 AND type = 'user_receivable'`,
      [settlement.group_id, settlement.to_user]
    );

    if (fromPayableIdResult.rows.length > 0) {
      const payableId = fromPayableIdResult.rows[0].id;
      // Reduce debt
      await txQuery(
        client,
        `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type)
         VALUES ($1, $2, 'settlement', $3, 'debit')`,
        [payableId, settlementId, settlement.amount]
      );
      await txQuery(
        client,
        `UPDATE ledger_accounts SET current_balance = current_balance - $1 WHERE id = $2`,
        [settlement.amount, payableId]
      );
    }

    if (toReceivableIdResult.rows.length > 0) {
      const receivableId = toReceivableIdResult.rows[0].id;
      // Reduce receivable
      await txQuery(
        client,
        `INSERT INTO ledger_entries (account_id, reference_id, reference_type, amount, entry_type)
         VALUES ($1, $2, 'settlement', $3, 'credit')`,
        [receivableId, settlementId, settlement.amount]
      );
      await txQuery(
        client,
        `UPDATE ledger_accounts SET current_balance = current_balance - $1 WHERE id = $2`,
        [settlement.amount, receivableId]
      );
    }

    // 3. Activity Log
    await txQuery(
      client,
      `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
       VALUES ($1, $2, 'settlement_made', $3)`,
      [
        settlement.group_id,
        settlement.from_user,
        JSON.stringify({
          settlementId,
          amount: settlement.amount,
          toUser: settlement.to_user,
          method: paymentMethod,
        }),
      ]
    );
  });

  // Re-run settlement optimizer
  await enqueueSettlementOptimization(settlement.group_id);
}

/**
 * POST /api/v1/groups/:groupId/payments/create-order
 * Creates a Stripe PaymentIntent to initiate a card payment for a settlement
 */
router.post('/create-order', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const stripe = getStripeClient();

    const groupId = req.groupMembership!.groupId;
    const userId = req.auth!.userId;
    const settlementId = validateUUID(req.body.settlementId, 'settlementId');

    const result = await query<SettlementRow>(
      `SELECT * FROM settlements WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
      [settlementId, groupId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Pending settlement not found', 404);
    }

    const settlement = result.rows[0];

    // Ensure the from_user is the one making the request
    if (settlement.from_user !== userId) {
      throw new AppError('You can only pay your own settlements', 403);
    }

    const amountInPaisa = Math.round(parseFloat(settlement.amount) * 100);

    // Create a PaymentIntent with the final amount and attach metadata for the webhook
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaisa,
      currency: settlement.currency.toLowerCase(),
      metadata: {
        settlementId: settlement.id,
        groupId: settlement.group_id,
      },
    });

    res.json({
      status: 'success',
      data: {
        clientSecret: paymentIntent.client_secret,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/groups/:groupId/payments/mark-cash
 * Manually settle without interacting with Stripe
 */
router.post('/mark-cash', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const userId = req.auth!.userId;
    const settlementId = validateUUID(req.body.settlementId, 'settlementId');

    const result = await query<SettlementRow>(
      `SELECT * FROM settlements WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
      [settlementId, groupId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Pending settlement not found', 404);
    }

    const settlement = result.rows[0];

    // Allow from_user or to_user or admin to mark as cash
    if (
      settlement.from_user !== userId &&
      settlement.to_user !== userId &&
      req.groupMembership!.role !== 'admin'
    ) {
      throw new AppError('Only participants or admin can mark settlement as cash', 403);
    }

    await completeSettlementLogic(settlementId, 'cash');

    res.json({
      status: 'success',
      message: 'Settlement marked as cash successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/groups/:groupId/payments/checkout-session
 * Creates a Stripe Checkout Session for card payment on an existing pending settlement
 * this below section is added in development
 */
router.post('/checkout-session', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const stripe = getStripeClient();
    const groupId = req.groupMembership!.groupId;
    const userId = req.auth!.userId;
    const settlementId = validateUUID(req.body.settlementId, 'settlementId');

    const result = await query<SettlementRow>(
      `SELECT * FROM settlements WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
      [settlementId, groupId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Pending settlement not found', 404);
    }

    const settlement = result.rows[0];

    if (settlement.from_user !== userId) {
      throw new AppError('You can only pay your own settlements', 403);
    }

    const amountInPaisa = Math.round(parseFloat(settlement.amount) * 100);
    const origin = req.headers.origin || req.headers.referer || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: settlement.currency.toLowerCase(),
            unit_amount: amountInPaisa,
            product_data: {
              name: `Nexora Settlement`,
              description: `Group payment settlement`,
            },
          },
        },
      ],
      metadata: {
        settlementId: settlement.id,
        groupId: settlement.group_id,
      },
      success_url: `${origin}/?settlement_paid=${settlement.id}`,
      cancel_url: `${origin}/`,
    });

    res.json({
      status: 'success',
      data: { url: session.url },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

