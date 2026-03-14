import { logger } from './logger.js';

interface EnvRequirement {
  key: string;
  required: boolean;
  feature: string;
}

const ENV_REQUIREMENTS: EnvRequirement[] = [
  { key: 'DATABASE_URL', required: true, feature: 'core' },
  { key: 'REDIS_URL', required: true, feature: 'core' },
  { key: 'JWT_ACCESS_SECRET', required: true, feature: 'auth' },
  { key: 'JWT_REFRESH_SECRET', required: true, feature: 'auth' },
  { key: 'STRIPE_SECRET_KEY', required: true, feature: 'payments' },
  { key: 'STRIPE_WEBHOOK_SECRET', required: true, feature: 'payments' },
  { key: 'GOOGLE_CLIENT_ID', required: false, feature: 'google-oauth' },
  { key: 'BLOCKCHAIN_SERVICE_URL', required: false, feature: 'blockchain' },
];

export function validateEnvironment(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const req of ENV_REQUIREMENTS) {
    const value = process.env[req.key];

    if (!value || value.trim().length === 0) {
      if (req.required) {
        missing.push(`${req.key} (${req.feature})`);
      } else {
        warnings.push(`${req.key} (${req.feature}) — feature will be disabled`);
      }
    }
  }

  for (const w of warnings) {
    logger.warn(`[ENV] Missing optional: ${w}`);
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables:\n  - ${missing.join('\n  - ')}`;
    logger.fatal(`[ENV] ${message}`);
    throw new Error(message);
  }

  logger.info('[ENV] All required environment variables are present');
}
