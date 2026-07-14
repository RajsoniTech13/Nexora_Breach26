import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { redis } from '../redis/client.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /health
 * Returns server health status with optional DB & Redis checks.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const health: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.database = { status: 'connected', latency: `${Date.now() - dbStart}ms` };
  } catch (err) {
    logger.warn({ err }, 'Health check: database unreachable');
    health.database = { status: 'disconnected' };
    health.status = 'degraded';
  }

  try {
    const redisStart = Date.now();
    await redis.ping();
    health.redis = { status: 'connected', latency: `${Date.now() - redisStart}ms` };
  } catch (err) {
    logger.warn({ err }, 'Health check: redis unreachable');
    health.redis = { status: 'disconnected' };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
