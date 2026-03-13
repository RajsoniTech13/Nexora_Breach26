import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
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

  app.use('/api/v1/auth', authRouter);
  app.use(healthRouter);
  app.use(errorHandler);

  return app;
}
