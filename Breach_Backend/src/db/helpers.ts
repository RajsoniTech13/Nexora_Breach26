import { PoolClient, QueryResultRow, QueryResult } from 'pg';
import { pool } from './pool.js';
import { logger } from '../lib/logger.js';

/**
 * Execute a callback inside a database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 *
 * Usage:
 * ```ts
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO ...');
 *   await client.query('INSERT INTO ...');
 *   return { success: true };
 * });
 * ```
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Transaction rolled back');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Typed query helper for use within transactions.
 * Logs slow queries (> 200ms).
 */
export async function txQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await client.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 200) {
    logger.warn({ duration, query: text }, 'Slow transaction query');
  }

  return result;
}
