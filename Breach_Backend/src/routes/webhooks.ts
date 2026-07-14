import express, { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { completeSettlementLogic } from './payments.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Lazy-initialize Stripe to avoid crashing at module load when keys are missing
let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) return null;
  _stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  return _stripe;
}

/**
 * POST /api/v1/webhooks/stripe
 * Listen to Webhook events from Stripe to securely finalize a payment.
 * MUST use raw body parsing to verify the signature.
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next) => {
    const stripe = getStripe();
    const endpointSecret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!stripe || !endpointSecret) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;

    try {
      if (!sig) {
        res.status(400).send('Webhook Error: Missing stripe-signature header');
        return;
      }
      
      // Verify signature to prevent spoofing
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      logger.warn({ err }, 'Stripe webhook signature verification failed');
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const settlementId = paymentIntent.metadata.settlementId;
          
          if (settlementId) {
            // Wait for DB to update status, adjust sub-ledgers, and emit jobs
            await completeSettlementLogic(settlementId, 'stripe', paymentIntent.id);
            logger.info({ settlementId, paymentIntentId: paymentIntent.id }, 'Stripe webhook: settlement completed');
          } else {
            logger.warn({ paymentIntentId: paymentIntent.id }, 'Stripe webhook: payment succeeded but no settlementId in metadata');
          }
          break;
        default:
          logger.info({ eventType: event.type }, 'Stripe webhook: unhandled event type');
      }

      // Return a 200 response to acknowledge receipt of the event
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

