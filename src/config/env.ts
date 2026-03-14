// src/config/env.ts
// Add this to your existing env validation (using Zod)

import { z } from 'zod';

const envSchema = z.object({
  // ... your existing env vars (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)
  
  // ADD THIS LINE:
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
});

// ... rest of your existing env.ts code
export const env = envSchema.parse(process.env);