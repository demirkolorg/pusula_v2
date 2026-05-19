import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertJournalMonotonic } from './journal';

describe('drizzle migration journal', () => {
  it('has strictly increasing `when` timestamps (Drizzle silently skips non-monotonic migrations — DEM-205)', () => {
    const srcDir = dirname(fileURLToPath(import.meta.url));
    const journalPath = resolve(srcDir, '..', 'drizzle', 'meta', '_journal.json');

    expect(() => assertJournalMonotonic(journalPath)).not.toThrow();
  });
});
