import { describe, expect, it } from 'vitest';
import { POSITION_COMPACTION_MAX_LEN } from './constants';
import { firstPosition, isValidPosition, positionBetween, positionsBetween, shouldCompact } from './position';

/**
 * `position.ts` is a thin wrapper around `fractional-indexing`; the library
 * itself is well-tested, so these checks just pin the wrapper's behaviour:
 * - `firstPosition()` is a valid key (and `positionBetween(null, null)` matches).
 * - inserting at the start / end / between two neighbours stays strictly ordered.
 * - consecutive moves keep a monotonically increasing sequence.
 * - `positionsBetween` yields `n` strictly increasing keys.
 */
describe('firstPosition / positionBetween(null, null)', () => {
  it('produces a non-empty key, identical to positionBetween(null, null)', () => {
    const first = firstPosition();
    expect(first.length).toBeGreaterThan(0);
    expect(positionBetween(null, null)).toBe(first);
  });
});

describe('positionBetween', () => {
  it('insert at the start: positionBetween(null, x) < x', () => {
    const x = firstPosition();
    const before = positionBetween(null, x);
    expect(before < x).toBe(true);
  });

  it('insert at the end: x < positionBetween(x, null)', () => {
    const x = firstPosition();
    const after = positionBetween(x, null);
    expect(x < after).toBe(true);
  });

  it('insert between two neighbours: a < positionBetween(a, b) < b', () => {
    const a = firstPosition();
    const b = positionBetween(a, null);
    const mid = positionBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('consecutive appends stay strictly increasing', () => {
    const keys: string[] = [firstPosition()];
    for (let i = 0; i < 25; i++) {
      keys.push(positionBetween(keys[keys.length - 1]!, null));
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  it('repeatedly inserting at the same midpoint stays ordered (a < ... < b)', () => {
    const a = firstPosition();
    const b = positionBetween(a, null);
    let lo = a;
    const hi = b;
    for (let i = 0; i < 25; i++) {
      const mid = positionBetween(lo, hi);
      expect(lo < mid).toBe(true);
      expect(mid < hi).toBe(true);
      lo = mid; // squeeze towards `hi`
    }
  });

  it('throws when the neighbours are out of order (before >= after)', () => {
    const a = firstPosition();
    const b = positionBetween(a, null);
    expect(() => positionBetween(b, a)).toThrow();
    expect(() => positionBetween(a, a)).toThrow();
  });
});

describe('positionsBetween', () => {
  it('positionsBetween(null, null, n) yields n strictly increasing keys', () => {
    const n = 5;
    const keys = positionsBetween(null, null, n);
    expect(keys).toHaveLength(n);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  it('positionsBetween(a, b, n) keeps every key strictly between a and b and increasing', () => {
    const a = firstPosition();
    const b = positionBetween(a, null);
    const keys = positionsBetween(a, b, 3);
    expect(keys).toHaveLength(3);
    expect(a < keys[0]!).toBe(true);
    expect(keys[keys.length - 1]! < b).toBe(true);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  it('positionsBetween(_, _, 0) returns an empty array', () => {
    expect(positionsBetween(null, null, 0)).toEqual([]);
  });
});

describe('isValidPosition', () => {
  it('accepts fractional-indexing keys produced by the helper', () => {
    expect(isValidPosition(firstPosition())).toBe(true);
    expect(isValidPosition(positionsBetween(null, null, 5)[4]!)).toBe(true);
    expect(isValidPosition(positionBetween(firstPosition(), null))).toBe(true);
  });

  it('rejects legacy single-letter order keys', () => {
    expect(isValidPosition('a')).toBe(false);
    expect(isValidPosition('b')).toBe(false);
    expect(isValidPosition('')).toBe(false);
  });
});

describe('shouldCompact', () => {
  it('POSITION_COMPACTION_MAX_LEN is 50', () => {
    expect(POSITION_COMPACTION_MAX_LEN).toBe(50);
  });

  it('an empty array never triggers compaction', () => {
    expect(shouldCompact([])).toBe(false);
  });

  it('normal short keys do not trigger compaction', () => {
    expect(shouldCompact([firstPosition()])).toBe(false);
    expect(shouldCompact(['a0', 'a1', 'Zz'])).toBe(false);
    // a key exactly one char short of the threshold is still fine
    expect(shouldCompact(['a'.repeat(POSITION_COMPACTION_MAX_LEN - 1)])).toBe(false);
  });

  it('a key at or beyond the threshold triggers compaction', () => {
    expect(shouldCompact(['a'.repeat(POSITION_COMPACTION_MAX_LEN)])).toBe(true);
    expect(shouldCompact(['a'.repeat(POSITION_COMPACTION_MAX_LEN + 10)])).toBe(true);
    // mixed: one long key among short ones is enough
    expect(shouldCompact(['a0', 'a'.repeat(POSITION_COMPACTION_MAX_LEN), 'a8'])).toBe(true);
  });
});
