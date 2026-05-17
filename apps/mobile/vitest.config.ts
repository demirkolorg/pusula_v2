import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Faz 7A — saf domain/sabit birim testleri (node ortamı). RN bileşen testleri
 * (RN Testing Library + jsdom/preset) Faz 7N test altyapısında eklenir.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
