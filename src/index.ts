import 'dotenv/config';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { pool, closePool } from './db/pool.js';
import { connectRedis, disconnectRedis } from './redis/client.js';
import {
  startSettlementOptimizationWorker,
  stopSettlementOptimizationWorker,
} from './queue/settlementQueue.js';

async function main(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.warn({ err }, 'PostgreSQL not available — starting without DB');
  }

  try {
    await connectRedis();
    startSettlementOptimizationWorker();
  } catch (err) {
    logger.warn({ err }, 'Redis not available — starting without Redis');
  }

  const app = createApp();
  const port = parseInt(process.env['PORT'] || '3000', 10);

  const server = app.listen(port, () => {
    logger.info({ port, env: process.env['NODE_ENV'] }, 'Server is running');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await closePool();
      } catch (err) {
        logger.error({ err }, 'Error closing database pool');
      }

      try {
        await stopSettlementOptimizationWorker();
      } catch (err) {
        logger.error({ err }, 'Error stopping settlement optimization worker');
      }

      try {
        await disconnectRedis();
      } catch (err) {
        logger.error({ err }, 'Error disconnecting Redis');
      }

      logger.info('Shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
