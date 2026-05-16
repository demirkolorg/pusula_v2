import { join } from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@pusula/ui', '@pusula/domain', '@pusula/api'],
  // Production Docker image (DEM-60): emit a self-contained `server.js` so the
  // runtime stage only ships the standalone bundle (no full node_modules).
  output: 'standalone',
  // Monorepo: the standalone tracer must walk up to the repo root so workspace
  // packages (`@pusula/ui` / `domain` / `api`) are traced into the bundle.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // Password reset and email verification carry one-time tokens in `?token=`.
  // Send `Referrer-Policy: no-referrer` so token-bearing URLs never leak via
  // the `Referer` header to any third party the page might talk to.
  async headers() {
    return [
      {
        source: '/:path(reset-password|forgot-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

// Sentry — `pusula-web` projesi. `withSentryConfig` derleme zamanı source map
// yüklemesini sarmalar; `SENTRY_AUTH_TOKEN`/`SENTRY_ORG` yoksa yükleme atlanır
// (runtime hata izleme yine `instrumentation*.ts` ile çalışır).
// Bkz. `docs/architecture/10-platform.md` §10.5.1.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: 'pusula-web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // CI dışında sessiz: token yokken uyarı basmasın.
  silent: !process.env.CI,
});
