// Sentry — `pusula-api` hata izleme başlatma.
//
// Bu modül `index.ts`'in *ilk* import'u olmalı: `Sentry.init()` diğer modüller
// (http, pg, hono) yüklenmeden çalışmalı ki auto-instrumentation onları
// sarabilsin. Kapsam = hata izleme; `captureException` init sonrası her zaman
// çalışır. Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/node';

import { env } from './env';

Sentry.init({
  dsn: env.SENTRY_DSN_API,
  // DSN yoksa SDK olay göndermez — lokal dev/test Sentry'siz çalışır.
  enabled: Boolean(env.SENTRY_DSN_API),
  environment: env.NODE_ENV,
  // Kapsam = hata izleme. Performans tracing (OpenTelemetry tabanlı
  // auto-instrumentation) kapsam dışı — ESM altında ayrı `--import` kurulumu
  // gerektirir; ileri iş.
  tracesSampleRate: 0,
  // Hassas veri (header, cookie, body) gönderme — yetki/kimlik kuralları gereği.
  sendDefaultPii: false,
});
