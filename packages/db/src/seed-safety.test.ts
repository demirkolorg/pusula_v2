import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('db seed safety', () => {
  it('does not keep the retired kaymakamlik demo seed script in package sources', () => {
    const srcDir = dirname(fileURLToPath(import.meta.url));

    expect(existsSync(resolve(srcDir, 'seed-kaymakamlik.ts'))).toBe(false);
  });
});
