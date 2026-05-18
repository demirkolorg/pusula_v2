/**
 * Shared card-creation step (DEM-203). Extracted from `card.create`'s
 * transaction body so both `card.create` and `quickNote.convertToCard` create
 * a card with *identical* side effects — append-to-end position via
 * `@pusula/domain/position`, a `card.created` activity event, a
 * `realtime_events` outbox row, the `boards.version` bump and the search
 * document upsert — without copy-pasting the logic.
 *
 * The function runs entirely inside the caller's transaction; it returns the
 * created card row plus the `realtimeEventId` so the caller can enqueue the
 * realtime-publish job *after* the transaction commits (via
 * `maybeEnqueueRealtimePublish`). It does NOT resolve board access or check
 * the archived-board / archived-list gates — the caller must do that before
 * calling (exactly as `card.create` does).
 *
 * See `docs/architecture/03-backend.md` (card router + `quickNote` router) and
 * `docs/architecture/04-veri-katmani.md` (DEM-203 transaction disiplini).
 */
import { activityEvents, boards, cards, desc, eq, sql } from '@pusula/db';
import { firstPosition, positionBetween } from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import type { Queryable } from '../middleware/board-access';
import { insertRealtimeEvent } from './realtime-publish';
import { upsertSearchDocument } from './search-indexer';

/** Columns of a full card row returned to clients — shared with the card router. */
export const cardCols = {
  id: cards.id,
  boardId: cards.boardId,
  listId: cards.listId,
  title: cards.title,
  description: cards.description,
  position: cards.position,
  dueAt: cards.dueAt,
  completed: cards.completed,
  completedAt: cards.completedAt,
  completedBy: cards.completedBy,
  coverColor: cards.coverColor,
  coverImageAttachmentId: cards.coverImageAttachmentId,
  archivedAt: cards.archivedAt,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
} as const;

/** The created card row, shaped by `cardCols`. */
export type CreatedCard = {
  [K in keyof typeof cardCols]: (typeof cards.$inferSelect)[K];
};

export interface CreateCardArgs {
  /** Target list — already validated as active by the caller. */
  list: { id: string; boardId: string };
  /** The board the list belongs to — already access-checked & active. */
  board: { workspaceId: string };
  /** New card title. */
  title: string;
  /** The acting user (card-creator / activity actor). */
  actorId: string;
  /** Optional collaborative mutation id (folded into activity + realtime rows). */
  clientMutationId: string | undefined;
}

export interface CreateCardResult {
  card: CreatedCard;
  /** Pass to `maybeEnqueueRealtimePublish` after the transaction commits. */
  realtimeEventId: string;
}

/**
 * Append a card to the end of `list` inside the caller's transaction. Mirrors
 * `card.create` exactly: highest-position card lookup (active + archived,
 * positions are a single sequence per list), `card.created` activity event,
 * realtime outbox row, `boards.version` bump and search-document upsert.
 */
export async function createCardInTransaction(
  tx: Queryable,
  args: CreateCardArgs,
): Promise<CreateCardResult> {
  const { list, board, title, actorId, clientMutationId } = args;

  // Highest-position card in the list (active *and* archived — positions are
  // a single sequence per list); place the new one right after it.
  const [last] = await tx
    .select({ position: cards.position })
    .from(cards)
    .where(eq(cards.listId, list.id))
    .orderBy(desc(cards.position))
    .limit(1);
  const position = last ? positionBetween(last.position, null) : firstPosition();

  const [created] = await tx
    .insert(cards)
    // `boardId` is the list's board — the card ⊆ list.board invariant.
    .values({ boardId: list.boardId, listId: list.id, title, position })
    .returning(cardCols);
  if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

  await tx.insert(activityEvents).values({
    workspaceId: board.workspaceId,
    boardId: list.boardId,
    cardId: created.id,
    actorId,
    type: 'card.created',
    payload: {
      cardId: created.id,
      listId: list.id,
      title: created.title,
      position: created.position,
      clientMutationId,
    },
  });

  const [bumped] = await tx
    .update(boards)
    .set({ version: sql`${boards.version} + 1` })
    .where(eq(boards.id, list.boardId))
    .returning({ version: boards.version });

  const realtimeEventId = await insertRealtimeEvent(tx, {
    type: 'card.created',
    workspaceId: board.workspaceId,
    boardId: list.boardId,
    cardId: created.id,
    actorId,
    clientMutationId,
    seq: bumped?.version ?? 0,
    data: {
      cardId: created.id,
      listId: list.id,
      title: created.title,
      position: created.position,
    },
  });

  await upsertSearchDocument(tx, { entityType: 'card', entityId: created.id });

  return { card: created, realtimeEventId };
}
