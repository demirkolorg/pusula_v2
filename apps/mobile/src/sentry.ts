import * as Sentry from '@sentry/react-native';

import { env } from './env';

/**
 * Sentry mobil (`pusula-mobile`) — crash reporting.
 *
 * Ayrı DSN: hatanın hangi katmandan (web/api/worker/mobile) geldiği DSN'den
 * net olsun (web/api/worker simetrisi — bkz. `10-platform.md` §10.5.1).
 * DSN boşsa SDK olay göndermez → lokal dev/test Sentry'siz çalışır.
 * Performans tracing ve session replay kapsam dışı (ileri iş).
 */
export function initSentry(): void {
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    enabled: Boolean(env.EXPO_PUBLIC_SENTRY_DSN),
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

/** Kök bileşeni Sentry hata sınırıyla sarar (`app/_layout.tsx`). */
export const wrapWithSentry = Sentry.wrap;
