'use client';

// Kök layout'un kendisi hata verdiğinde devreye giren son-çare hata sınırı.
// Kendi <html>/<body>'sini render eder; provider/tema'ya güvenemez.
// Hatayı Sentry'ye iletir. Bkz. `docs/architecture/10-platform.md` §10.5.1.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Bir şeyler ters gitti</h1>
        <p style={{ color: '#666', maxWidth: '28rem' }}>
          Beklenmeyen bir hata oluştu. Sayfayı yeniden yüklemeyi deneyebilirsiniz.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#1f6feb',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Tekrar dene
        </button>
      </body>
    </html>
  );
}
