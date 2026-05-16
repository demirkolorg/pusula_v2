import { z } from 'zod';

/**
 * Web runtime env. Only `NEXT_PUBLIC_*` keys are exposed to the browser; Next.js
 * inlines them at build time, so they must be referenced statically (which is why
 * `process.env.NEXT_PUBLIC_API_URL` is spelled out below rather than indexed).
 */
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
  // Sentry `pusula-web` projesinin DSN'i. DSN gizli değildir (yalnız olay
  // göndermeye izin verir) — tarayıcı bundle'ına girdiği için `NEXT_PUBLIC_`
  // prefix'li. Boş/eksikse `Sentry.init` no-op olur. Bkz. `10-platform.md` §10.5.1.
  NEXT_PUBLIC_SENTRY_DSN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

export type Env = typeof env;
