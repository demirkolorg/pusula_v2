// Sentry — Next.js Edge runtime (middleware, edge route) tarafı başlatma.
// `instrumentation.ts`'in `register()`'ı tarafından dinamik import edilir.
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
