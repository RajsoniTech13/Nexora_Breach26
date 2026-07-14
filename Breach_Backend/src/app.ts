import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import groupsRouter from './routes/groups.js';
import membersRouter from './routes/members.js';
import expensesRouter from './routes/expenses.js';
import settlementsRouter from './routes/settlements.js';
import balancesRouter from './routes/balances.js';
import paymentRouter from './routes/payments.js';
import webhookRouter from './routes/webhooks.js';
import { optionalAuth } from './middleware/auth.js';
import { userRateLimit } from './middleware/rateLimit.js';
import receiptRoutes from './routes/receipt.routes.js';
import blockchainRouter from './routes/blockchain.js';
import parseRouter from './routes/nlp.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());

  // Parse allowed origins from FRONTEND_URL (comma-separated)
  const allowedOrigins = (process.env['FRONTEND_URL'] || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, health checks)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check exact match against allowed origins
      if (allowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }

      // Allow any Vercel preview deployment
      if (origin.endsWith('.vercel.app')) {
        callback(null, origin);
        return;
      }

      // Allow localhost for development
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, origin);
        return;
      }

      // Reject unknown origins
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // Cache preflight for 24 hours
  }));
  app.use(compression());

  app.use('/api/v1/webhooks', webhookRouter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(optionalAuth);
  app.use(userRateLimit);

  // Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/groups/:groupId/members', membersRouter);
  app.use('/api/v1/groups/:groupId/expenses', expensesRouter);
  app.use('/api/v1/groups/:groupId/settlements', settlementsRouter);
  app.use('/api/v1/groups/:groupId/balances', balancesRouter);
  app.use('/api/v1/groups/:groupId/payments', paymentRouter);
  app.use('/api/v1/groups/:groupId/nlp', parseRouter);
  app.use('/api/v1/receipts', receiptRoutes);
  app.use('/api/v1/blockchain', blockchainRouter);

  app.use(healthRouter);
  app.use(errorHandler);

  return app;
}
