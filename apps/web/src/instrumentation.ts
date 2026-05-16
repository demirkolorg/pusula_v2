// Next.js instrumentation hook'u — sunucu/edge runtime'a göre Sentry'yi başlatır
// ve sunucu hatalarını (`onRequestError`) Sentry'ye iletir.
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// React Server Component / route handler / server action hatalarını yakalar.
export const onRequestError = Sentry.captureRequestError;
