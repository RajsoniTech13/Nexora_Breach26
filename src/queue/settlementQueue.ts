import { Job, Queue, Worker } from 'bullmq';
import { AppError } from '../types/index.js';
import { redis } from '../redis/client.js';
import { logger } from '../lib/logger.js';
import { query } from '../db/pool.js';

const QUEUE_NAME = 'settlement-optimization';
const CACHE_TTL_SECONDS = 3600;

interface BalanceEdgeRow {
  from_user: string;
  to_user: string;
  amount: string;
}

interface SettlementPlanItem {
  from: string;
  to: string;
  amount: number;
}

interface OptimizationJobData {
  groupId: string;
}

type OptimizationJobName = 'recalculate';

interface ParticipantNode {
  userId: string;
  amount: number;
}

const redisUrl = process.env['REDIS_URL'];
if (!redisUrl) {
  throw new Error('Missing REDIS_URL environment variable');
}

const parsedRedisUrl = new URL(redisUrl);
const redisConnection = {
  host: parsedRedisUrl.hostname,
  port: parsedRedisUrl.port ? parseInt(parsedRedisUrl.port, 10) : 6379,
  username: parsedRedisUrl.username || undefined,
  password: parsedRedisUrl.password || undefined,
  db: parsedRedisUrl.pathname && parsedRedisUrl.pathname !== '/' ? parseInt(parsedRedisUrl.pathname.slice(1), 10) : 0,
  tls: parsedRedisUrl.protocol === 'rediss:' ? {} : undefined,
};

const queue = new Queue<OptimizationJobData, void, OptimizationJobName>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

export function getSettlementPlanCacheKey(groupId: string): string {
  return `group:${groupId}:settlement_plan`;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSettlementPlanFromBalances(balanceByUser: Map<string, number>): SettlementPlanItem[] {
  const creditors: ParticipantNode[] = [];
  const debtors: ParticipantNode[] = [];

  for (const [userId, balance] of balanceByUser.entries()) {
    if (balance > 0.01) {
      creditors.push({ userId, amount: roundCurrency(balance) });
      continue;
    }

    if (balance < -0.01) {
      debtors.push({ userId, amount: roundCurrency(Math.abs(balance)) });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const plan: SettlementPlanItem[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const settleAmount = roundCurrency(Math.min(creditor.amount, debtor.amount));

    if (settleAmount > 0) {
      plan.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: settleAmount,
      });
    }

    creditor.amount = roundCurrency(creditor.amount - settleAmount);
    debtor.amount = roundCurrency(debtor.amount - settleAmount);

    if (creditor.amount < 0.01) {
      creditorIndex += 1;
    }

    if (debtor.amount < 0.01) {
      debtorIndex += 1;
    }
  }

  return plan;
}

async function calculateGroupSettlementPlan(groupId: string): Promise<SettlementPlanItem[]> {
  const expenseEdges = await query<BalanceEdgeRow>(
    `SELECT es.user_id AS from_user, e.paid_by AS to_user, es.owed_amount::text AS amount
     FROM expense_splits es
     JOIN expenses e ON e.id = es.expense_id
     WHERE e.group_id = $1
       AND e.is_deleted = false
       AND es.user_id <> e.paid_by`,
    [groupId],
  );

  const settlementEdges = await query<BalanceEdgeRow>(
    `SELECT from_user, to_user, amount::text AS amount
     FROM settlements
     WHERE group_id = $1
       AND status = 'completed'`,
    [groupId],
  );

  const balanceByUser = new Map<string, number>();

  for (const edge of expenseEdges.rows) {
    const amount = roundCurrency(parseFloat(edge.amount));
    balanceByUser.set(edge.from_user, roundCurrency((balanceByUser.get(edge.from_user) ?? 0) - amount));
    balanceByUser.set(edge.to_user, roundCurrency((balanceByUser.get(edge.to_user) ?? 0) + amount));
  }

  // Completed settlements partially/fully reduce original debts.
  for (const edge of settlementEdges.rows) {
    const amount = roundCurrency(parseFloat(edge.amount));
    balanceByUser.set(edge.from_user, roundCurrency((balanceByUser.get(edge.from_user) ?? 0) + amount));
    balanceByUser.set(edge.to_user, roundCurrency((balanceByUser.get(edge.to_user) ?? 0) - amount));
  }

  return buildSettlementPlanFromBalances(balanceByUser);
}

async function processOptimizationJob(job: Job<OptimizationJobData>): Promise<void> {
  const { groupId } = job.data;
  const plan = await calculateGroupSettlementPlan(groupId);
  await redis.set(getSettlementPlanCacheKey(groupId), JSON.stringify(plan), 'EX', CACHE_TTL_SECONDS);
}

let worker: Worker<OptimizationJobData, void, OptimizationJobName> | null = null;

export async function enqueueSettlementOptimization(groupId: string): Promise<void> {
  await queue.add(
    'recalculate',
    { groupId },
    {
      jobId: `group:${groupId}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function getCachedSettlementPlan(groupId: string): Promise<SettlementPlanItem[] | null> {
  const raw = await redis.get(getSettlementPlanCacheKey(groupId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SettlementPlanItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new AppError('Failed to parse cached settlement plan', 500);
  }
}

export function startSettlementOptimizationWorker(): Worker<OptimizationJobData, void, OptimizationJobName> {
  if (worker) {
    return worker;
  }

  worker = new Worker<OptimizationJobData, void, OptimizationJobName>(QUEUE_NAME, processOptimizationJob, {
    connection: redisConnection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, groupId: job.data.groupId }, 'Settlement optimization completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, groupId: job?.data.groupId }, 'Settlement optimization failed');
  });

  return worker;
}

export async function stopSettlementOptimizationWorker(): Promise<void> {
  if (!worker) {
    return;
  }

  await worker.close();
  worker = null;
}
