import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@pusula/ui', '@pusula/domain', '@pusula/api', '@pusula/db'],
};

export default config;
