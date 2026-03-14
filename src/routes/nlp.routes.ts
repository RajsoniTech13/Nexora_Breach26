import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { parseExpenseController } from '../controllers/nlp.controller.js';
import { redis } from '../redis/client.js';
import { AppError } from '../types/index.js';


const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


const AI_WINDOW_SECONDS = 60;
const AI_MAX_REQUESTS = 10;

async function aiRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      next();
      return;
    }

    const key = `rate_limit:nlp:user:${userId}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, AI_WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);

    res.setHeader('X-AI-RateLimit-Limit', String(AI_MAX_REQUESTS));
    res.setHeader('X-AI-RateLimit-Remaining', String(Math.max(0, AI_MAX_REQUESTS - count)));
    res.setHeader('X-AI-RateLimit-Reset', String(ttl > 0 ? ttl : AI_WINDOW_SECONDS));

    if (count > AI_MAX_REQUESTS) {
      next(new AppError('Too many AI requests. Please wait a moment before trying again.', 429));
      return;
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

const router = Router({ mergeParams: true });


router.post(
  '/parse',
  asyncHandler(requireAuth),
  asyncHandler(aiRateLimit),
  asyncHandler(parseExpenseController),
);

export default router;
