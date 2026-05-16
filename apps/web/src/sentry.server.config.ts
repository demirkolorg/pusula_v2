// Sentry — Next.js sunucu (Node.js runtime) tarafı başlatma.
// `instrumentation.ts`'in `register()`'ı tarafından dinamik import edilir.
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // DSN yoksa SDK olay göndermez — lokal dev/test Sentry'siz çalışır.
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  // Kapsam = hata izleme; performans tracing düşük örnekleme ile açık.
  tracesSampleRate: 0.1,
  // Hassas veri (header, cookie, body) gönderme — yetki/kimlik kuralları gereği.
  sendDefaultPii: false,
});
