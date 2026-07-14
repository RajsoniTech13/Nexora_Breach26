import { NextFunction, Request, Response } from 'express';
import { redis } from '../redis/client.js';
import { AppError } from '../types/index.js';
import {
  getRedisKeyForToken,
  parseBearerToken,
  verifyAccessToken,
} from '../lib/jwt.js';

async function resolveAuthFromHeader(req: Request): Promise<void> {
  const token = parseBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);

  const blacklistKey = getRedisKeyForToken('blacklist', payload.jti);
  const isBlacklisted = await redis.exists(blacklistKey);

  if (isBlacklisted) {
    throw new AppError('Token has been revoked', 401);
  }

  req.auth = {
    userId: payload.sub,
    jti: payload.jti,
    tokenType: payload.type,
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await resolveAuthFromHeader(req);
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.authorization) {
    next();
    return;
  }

  try {
    await resolveAuthFromHeader(req);
    next();
  } catch {
    next();
  }
}
