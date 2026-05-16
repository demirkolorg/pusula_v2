// Sentry — tarayıcı (client) tarafı başlatma. Next.js bu dosyayı istemci
// bundle'ına otomatik dahil eder. Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // DSN yoksa SDK olay göndermez — lokal dev/test Sentry'siz çalışır.
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  // Kapsam = hata izleme; performans tracing düşük örnekleme ile açık.
  tracesSampleRate: 0.1,
  // Session replay kapsam dışı (ileri iş).
  sendDefaultPii: false,
});

// İstemci tarafı route geçişlerini tracing'e bağlar.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
