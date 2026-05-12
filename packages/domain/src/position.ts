/**
 * Fractional ranking for list/card ordering.
 *
 * Positions are LexoRank-like strings (not integers): inserting between two
 * neighbours only mutates the moved row, never the whole list. See
 * `docs/PUSULA_TEKNIK_MIMARI.md` §5 and §6.
 *
 * Backed by `fractional-indexing` (`generateKeyBetween` / `generateNKeysBetween`).
 * When the gap between two keys gets very long, a background compaction job can
 * re-balance the affected list.
 */
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Position string for an item placed between `before` and `after`.
 * Pass `null` for an open end (start or end of the list).
 */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before ?? null, after ?? null);
}

/** `n` evenly spaced position strings between `before` and `after` (inclusive ends as `null`). */
export function positionsBetween(
  before: string | null,
  after: string | null,
  n: number,
): string[] {
  return generateNKeysBetween(before ?? null, after ?? null, n);
}

/** First position string for an empty list. */
export function firstPosition(): string {
  return generateKeyBetween(null, null);
}

export { generateKeyBetween, generateNKeysBetween };
