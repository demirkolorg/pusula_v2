/**
 * Shared helpers for drag-drop / move procedures (`list.move`, `card.move`) —
 * resolving the new fractional `position` from the target neighbours, validating
 * a client-supplied `newPosition`. See `docs/architecture/05-board-mekanigi.md`
 * §5.1 and `docs/domain/03-siralama-kurallari.md`.
 */
import { positionBetween } from '@pusula/domain';
import { TRPCError } from '@trpc/server';

/**
 * Validate a client-supplied position against the (possibly open-ended) target
 * neighbours: `before.position < newPosition < after.position` (string compare).
 * An open end (`null`) skips that side. Throws `BAD_REQUEST` on a violation.
 */
export function assertPositionBetween(
  newPosition: string,
  before: string | null,
  after: string | null,
): void {
  if ((before !== null && !(before < newPosition)) || (after !== null && !(newPosition < after))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz konum.' });
  }
}

/**
 * Resolve the new position for a move: validate `newPosition` against the
 * neighbours if the client supplied one, otherwise compute `positionBetween`
 * (which throws when the neighbours are out of order — surfaced as `BAD_REQUEST`).
 */
export function resolveMovePosition(
  newPosition: string | undefined,
  before: string | null,
  after: string | null,
): string {
  if (newPosition !== undefined) {
    assertPositionBetween(newPosition, before, after);
    return newPosition;
  }
  try {
    return positionBetween(before, after);
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz konum.' });
  }
}
