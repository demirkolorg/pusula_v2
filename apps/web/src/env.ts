import { z } from 'zod';

/**
 * Web runtime env. Only `NEXT_PUBLIC_*` keys are exposed to the browser; Next.js
 * inlines them at build time, so they must be referenced statically (which is why
 * `process.env.NEXT_PUBLIC_API_URL` is spelled out below rather than indexed).
 */
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

export type Env = typeof env;
