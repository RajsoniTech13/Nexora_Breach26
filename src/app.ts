import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import groupsRouter from './routes/groups.js';
import membersRouter from './routes/members.js';
import expensesRouter from './routes/expenses.js';
import settlementsRouter from './routes/settlements.js';
import balancesRouter from './routes/balances.js';
import { optionalAuth } from './middleware/auth.js';
import { userRateLimit } from './middleware/rateLimit.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(optionalAuth);
  app.use(userRateLimit);

  // Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/groups/:groupId/members', membersRouter);
  app.use('/api/v1/groups/:groupId/expenses', expensesRouter);
  app.use('/api/v1/groups/:groupId/settlements', settlementsRouter);
  app.use('/api/v1/groups/:groupId/balances', balancesRouter);
  app.use(healthRouter);
  app.use(errorHandler);

  return app;
}
