import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@pusula\//],
  // Bundled CJS deps (e.g. `pg`, pulled in transitively via `@pusula/db`) call
  // `require()` for Node built-ins. In an ESM bundle esbuild's `__require` shim
  // throws "Dynamic require of X is not supported" unless a real `require` is
  // in scope — inject one via `createRequire` so the shim uses it.
  banner: {
    js: "import { createRequire as __pusulaCreateRequire } from 'module'; const require = __pusulaCreateRequire(import.meta.url);",
  },
});
