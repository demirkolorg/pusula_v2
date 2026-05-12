import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@pusula/ui', '@pusula/domain', '@pusula/api', '@pusula/db'],
  // The password-reset flow carries a one-time token in `?token=` on
  // `/reset-password` (and `/forgot-password` is the page that triggers it).
  // Send `Referrer-Policy: no-referrer` for those routes so the token-bearing
  // URL never leaks via the `Referer` header to any third party the page might
  // talk to — defense in depth. See `docs/architecture/07-auth.md`
  // (Şifre sıfırlama akışı).
  async headers() {
    return [
      {
        source: '/:path(reset-password|forgot-password)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default config;
