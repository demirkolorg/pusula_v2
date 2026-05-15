import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@pusula/ui', '@pusula/domain', '@pusula/api'],
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

export default config;
