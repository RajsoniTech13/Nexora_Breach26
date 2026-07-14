import { logger } from './logger.js';

const BLOCKCHAIN_URL = process.env['BLOCKCHAIN_SERVICE_URL'] || 'http://localhost:4001';

async function postToBlockchain(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BLOCKCHAIN_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      logger.warn({ path, status: res.status, data }, '[Blockchain] request failed');
      return null;
    }

    logger.info({ path, referenceId: body['id'], txHash: data['txHash'] }, '[Blockchain] anchored successfully');
    return data;
  } catch (err) {
    logger.warn({ err, path }, '[Blockchain] service unreachable — skipping');
    return null;
  }
}

/* ── Ledger ─────────────────────────────────────────── */

export interface BlockchainLedgerEntry {
  id: string;
  groupId?: string;
  accountId: string;
  referenceId: string;
  referenceType: string;
  amount: string;
  entryType: string;
}

export function anchorLedgerEntry(entry: BlockchainLedgerEntry): void {
  postToBlockchain('/blockchain/ledger', entry as unknown as Record<string, unknown>).catch(() => {});
}

export function verifyLedgerEntry(entry: BlockchainLedgerEntry): Promise<Record<string, unknown> | null> {
  return postToBlockchain('/blockchain/verify-ledger', entry as unknown as Record<string, unknown>);
}

/* ── Expense ────────────────────────────────────────── */

export interface BlockchainExpense {
  id: string;
  groupId: string;
  paidByUserId: string;
  amount: string;
  currency: string;
  category: string;
  description: string;
  expenseDate: string;
}

export function anchorExpense(expense: BlockchainExpense): void {
  postToBlockchain('/blockchain/expense', expense as unknown as Record<string, unknown>).catch(() => {});
}

export function verifyExpense(expense: BlockchainExpense): Promise<Record<string, unknown> | null> {
  return postToBlockchain('/blockchain/verify-expense', expense as unknown as Record<string, unknown>);
}

/* ── Settlement ─────────────────────────────────────── */

export interface BlockchainSettlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  currency: string;
  settledAt: string;
}

export function anchorSettlement(settlement: BlockchainSettlement): void {
  postToBlockchain('/blockchain/settlement', settlement as unknown as Record<string, unknown>).catch(() => {});
}

export function verifySettlement(settlement: BlockchainSettlement): Promise<Record<string, unknown> | null> {
  return postToBlockchain('/blockchain/verify-settlement', settlement as unknown as Record<string, unknown>);
}
