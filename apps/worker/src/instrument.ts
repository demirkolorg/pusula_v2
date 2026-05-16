// Sentry — `pusula-worker` hata izleme başlatma.
//
// Bu modül `index.ts`'in *ilk* import'u olmalı: `Sentry.init()` diğer modüller
// (bullmq, pg, ioredis) yüklenmeden çalışmalı. Kapsam = hata izleme;
// `captureException` init sonrası her zaman çalışır.
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/node';

import { env } from './env';

Sentry.init({
  dsn: env.SENTRY_DSN_WORKER,
  // DSN yoksa SDK olay göndermez — lokal dev/test Sentry'siz çalışır.
  enabled: Boolean(env.SENTRY_DSN_WORKER),
  environment: env.NODE_ENV,
  // Kapsam = hata izleme. Performans tracing kapsam dışı (ileri iş).
  tracesSampleRate: 0,
  // Hassas veri (job payload) gönderme.
  sendDefaultPii: false,
});
