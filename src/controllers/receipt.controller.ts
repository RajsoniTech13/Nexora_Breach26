// src/controllers/receipt.controller.ts

import { Request, Response, NextFunction } from 'express';
import { scanReceipt } from '../services/receipt.service.js';

export async function scanReceiptController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // 1. Check if a binary body was uploaded
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No receipt image found. Please attach an image file as raw binary.',
      });
    }

    const mimeType = req.headers['content-type'] || 'image/jpeg';
    
    // Check supported types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        error: 'Only JPEG, PNG, WebP, and HEIC images are allowed',
      });
    }

    // 2. Call the service to scan the receipt
    const result = await scanReceipt(req.body, mimeType);

    // 3. Return the result
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Receipt scanned successfully',
        data: result.data,
      });
    } else {
      return res.status(422).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    next(error); // Pass to your global error handler
  }
}