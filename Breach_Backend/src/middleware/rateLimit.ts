import { NextFunction, Request, Response } from 'express';
import { redis } from '../redis/client.js';
import { AppError } from '../types/index.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 1000;//100 -> 1000 for development

function getRateLimitIdentifier(req: Request): string {
  if (req.auth?.userId) {
    return `user:${req.auth.userId}`;
  }

  return `ip:${req.ip}`;
}

export async function userRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const key = `rate_limit:${getRateLimitIdentifier(req)}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);

    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - count)));
    res.setHeader('X-RateLimit-Reset', String(ttl > 0 ? ttl : WINDOW_SECONDS));

    if (count > MAX_REQUESTS) {
      throw new AppError('Too many requests', 429);
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }

    next();
  }
}
