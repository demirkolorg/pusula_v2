/**
 * Fractional ranking for list/card ordering.
 *
 * Positions are LexoRank-like strings (not integers): inserting between two
 * neighbours only mutates the moved row, never the whole list. See
 * `docs/domain/03-siralama-kurallari.md` (ordering rules) and
 * `docs/architecture/05-board-mekanigi.md` §5.1 (drag-drop mechanics).
 *
 * Backed by `fractional-indexing` (`generateKeyBetween` / `generateNKeysBetween`).
 * When the gap between two keys gets very long, a background compaction job can
 * re-balance the affected list.
 */
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { POSITION_COMPACTION_MAX_LEN } from './constants';

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

/** True when `position` is a valid `fractional-indexing` order key. */
export function isValidPosition(position: string): boolean {
  try {
    generateKeyBetween(position, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * True if any of the given position keys is long enough to warrant compaction
 * (≥ `POSITION_COMPACTION_MAX_LEN`). Move procedures call this on the key(s)
 * they just produced; when it's true the affected scope is enqueued for a
 * background re-balance. See `docs/domain/03-siralama-kurallari.md` "Compaction".
 */
export function shouldCompact(positions: readonly string[]): boolean {
  return positions.some((p) => p.length >= POSITION_COMPACTION_MAX_LEN);
}

export { generateKeyBetween, generateNKeysBetween };
