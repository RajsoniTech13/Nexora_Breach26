import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { AppError } from '../types/index.js';
import multer from 'multer';

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const isOperational = 'isOperational' in err ? err.isOperational : false;

  if (statusCode >= 500) {
    logger.error({ err, statusCode }, 'Internal server error');
  } else {
    logger.warn({ err, statusCode }, 'Client error');
  }

  const response: Record<string, unknown> = {
    status: 'error',
    message: isOperational ? err.message : 'Internal Server Error',
  };

  if (process.env['NODE_ENV'] !== 'production') {
    response.stack = err.stack;
  }
  // ---- ADD THIS BLOCK for Multer errors ----
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.',
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
    return;
  }

  // Handle our custom file filter error
  if (err.message === 'Only JPEG, PNG, WebP, and HEIC images are allowed') {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }
  // ---- END OF MULTER BLOCK ----

  res.status(statusCode).json(response);
}

