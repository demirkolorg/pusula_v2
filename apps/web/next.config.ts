import { join } from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@pusula/ui', '@pusula/domain', '@pusula/api'],
  // Faz 14B: `@react-pdf/renderer` server-side native module (fontkit/brotli)
  // taşır; webpack tracer bunları bundle'a yutmaya çalışırsa derleme şişer ve
  // standalone tracer hata verir. `serverExternalPackages` ile Node modüllerini
  // `require()` üzerinden runtime'da çöz.
  serverExternalPackages: ['@react-pdf/renderer'],
  // Production Docker image (DEM-60): emit a self-contained `server.js` so the
  // runtime stage only ships the standalone bundle (no full node_modules).
  output: 'standalone',
  // Monorepo: the standalone tracer must walk up to the repo root so workspace
  // packages (`@pusula/ui` / `domain` / `api`) are traced into the bundle.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  async headers() {
    const rules: { source: string; headers: { key: string; value: string }[] }[] = [
      // Password reset and email verification carry one-time tokens in `?token=`.
      // Send `Referrer-Policy: no-referrer` so token-bearing URLs never leak via
      // the `Referer` header to any third party the page might talk to.
      // `/sign-in` is the multi-mode auth screen — its `?mode=reset&token=…`
      // state carries the password-reset token. The legacy `reset-password` /
      // `forgot-password` routes are now redirect-only shells (they forward the
      // token to `/sign-in`) but stay covered as defense-in-depth.
      {
        source: '/:path(sign-in|reset-password|forgot-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];

    // Content-Security-Policy — yalnız PRODUCTION'da. Origin'ler üretim
    // domain'lerine sabit (api/s3/sentry); dev'de app `localhost:3001`'e
    // konuşur ve Next dev HMR `eval` kullanır → bu CSP dev'i kırardı.
    // ENFORCING (report-only değil). `script-src`: Next inline bootstrap için
    // `'unsafe-inline'` (`'unsafe-eval'` GEREKMEZ). `frame-src`: KRİTİK — kart
    // eki PDF önizlemesi `<iframe src="https://s3.pusulaportal.com/...">`.
    // NOT: deploy sonrası tarayıcı konsolunda doğrula — engellenen bir kaynak
    // çıkarsa ilgili direktife eklenir.
    if (process.env.NODE_ENV === 'production') {
      rules.unshift({
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://s3.pusulaportal.com",
              "font-src 'self' data:",
              "connect-src 'self' https://api.pusulaportal.com https://s3.pusulaportal.com https://o4511399874920448.ingest.de.sentry.io wss://api.pusulaportal.com",
              "frame-src 'self' https://s3.pusulaportal.com",
              "child-src 'self' https://s3.pusulaportal.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      });
    }

    return rules;
  },
};

// Sentry — `pusula-web` projesi. `withSentryConfig` derleme zamanı source map
// yüklemesini sarmalar; `SENTRY_AUTH_TOKEN`/`SENTRY_ORG` yoksa yükleme atlanır
// (runtime hata izleme yine `instrumentation*.ts` ile çalışır).
// `tunnelRoute`: tarayıcı, Sentry ingest domain'ine direkt POST atmak yerine
// same-origin `/monitoring` Next route'una gönderir; reklam engelleyicilerin
// (uBlock/Brave Shields/Pi-hole) `*.ingest.sentry.io` filtresi olayları
// ERR_BLOCKED_BY_CLIENT ile düşürmesini önler.
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: 'pusula-web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // CI dışında sessiz: token yokken uyarı basmasın.
  silent: !process.env.CI,
  tunnelRoute: '/monitoring',
});
