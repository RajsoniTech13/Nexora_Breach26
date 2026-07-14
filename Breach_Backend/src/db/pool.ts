import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../lib/logger.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  logger.warn('DATABASE_URL is not set; database operations may fail until it is configured');
}

// Render free-tier Postgres needs longer timeout (cold starts) and SSL
const isRenderDB = connectionString?.includes('render.com');

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // Render free tier can be slow on first connect
  ssl: isRenderDB ? { rejectUnauthorized: false } : undefined,
});

console.log("Connecting to:", connectionString?.split('@')[1] || "NOT FOUND");
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

pool.on('connect', () => {
  logger.debug('New database client connected');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 200) {
    logger.warn({ duration, query: text }, 'Slow query detected');
  } else {
    logger.debug({ duration, rows: result.rowCount }, 'Query executed');
  }

  return result;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}
export async function closePool(): Promise<void> {
  logger.info('Draining database connection pool...');
  await pool.end();
  logger.info('Database pool closed');
}
