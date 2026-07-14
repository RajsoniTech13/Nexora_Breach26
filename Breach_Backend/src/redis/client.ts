import Redis from 'ioredis';
import { logger } from '../lib/logger.js';

const redisUrl = process.env['REDIS_URL'];
const isRedisConfigured = Boolean(redisUrl);
if (!isRedisConfigured) {
  logger.warn('REDIS_URL is not set; Redis-backed features will be unavailable');
}

// Render Redis uses rediss:// (TLS) — ioredis needs explicit tls option
const isRenderRedis = redisUrl?.startsWith('rediss://');

export const redis = new Redis(redisUrl ?? 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  connectTimeout: 15_000, // Render free tier can be slow
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying after 3 attempts
    const delay = Math.min(times * 200, 5000);
    logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
    return delay;
  },
  lazyConnect: true,
  tls: isRenderRedis ? {} : undefined,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

export async function connectRedis(): Promise<void> {
  if (!isRedisConfigured) {
    return;
  }

  await redis.connect();
}
export async function disconnectRedis(): Promise<void> {
  if (!isRedisConfigured) {
    return;
  }

  logger.info('Disconnecting Redis...');
  await redis.quit();
  logger.info('Redis disconnected');
}
