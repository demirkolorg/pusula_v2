/**
 * Board cache types — derived from tRPC output of `board.get` / `board.list` /
 * `card.get` (single source: `@pusula/api`). Component code imports from here
 * instead of restating shapes; if a backend procedure adds/changes a field,
 * the cache types reflect it on the next tRPC type generation.
 *
 * Note on shape: `board.get` is *flat* — `{ board, lists[], cards[] }` with
 * cards carrying their `listId` — not a nested `lists[].cards[]` tree. The
 * cache transforms in `./primitives` operate on that flat shape; doc §5.2 of
 * `05-board-mekanigi.md` describes the conceptual model (cards belong to a
 * list) while the actual cache stays flat for cheap reconciliation.
 */
import type { RouterOutputs } from '@pusula/api';

/** Full `board.get` payload: `{ board, lists[], cards[] }`. */
export type BoardCache = RouterOutputs['board']['get'];

/** One row in `BoardCache.lists` (a list, archived or active). */
export type ListCache = BoardCache['lists'][number];

/** One row in `BoardCache.cards` (always an *active* card; archived are filtered out by the server). */
export type CardCache = BoardCache['cards'][number];

/** One row in `board.list` (workspace board summary). */
export type BoardSummary = RouterOutputs['board']['list'][number];

/** Full `card.get` payload (the modal's source of truth). */
export type CardDetailCache = RouterOutputs['card']['get'];
