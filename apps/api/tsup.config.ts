import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the internal workspace packages into the output so the deployed
  // container doesn't need the monorepo layout.
  noExternal: [/^@pusula\//],
});
