// src/routes/receipt.routes.ts

import { Router } from 'express';
import express from 'express';
import { scanReceiptController } from '../controllers/receipt.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/v1/receipts/scan
 * Upload a receipt image and get structured data back
 * 
 * - Auth required (only logged-in users)
 * - Raw binary upload
 * - Max 10MB, images only
 */
router.post(
  '/scan',
  requireAuth,
  express.raw({ type: '*/*', limit: '10mb' }),
  scanReceiptController
);

export default router;