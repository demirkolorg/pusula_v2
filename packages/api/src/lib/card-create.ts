/**
 * Shared card-creation step (DEM-203). Extracted from `card.create`'s
 * transaction body so both `card.create` and `quickNote.convertToCard` create
 * a card with *identical* side effects — a resolved fractional `position`
 * (append-to-end, or between neighbours when a `CardPlacement` is supplied —
 * DEM-205), a `card.created` activity event, a `realtime_events` outbox row,
 * the `boards.version` bump and the search document upsert — without
 * copy-pasting the logic.
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
import { activityEvents, boards, cards, desc, eq, inArray, sql } from '@pusula/db';
import { TRPCError } from '@trpc/server';
import type { Queryable } from '../middleware/board-access';
import { resolveMovePosition } from './position';
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

/**
 * Where the new card lands in its list. Omitted → appended to the end (the
 * `card.create` / mobile `quickNote.convertToCard` behaviour). When supplied
 * with neighbours, the card is placed between them (DEM-205 — web "Hızlı
 * Notlar" panel drag-to-list); the neighbours are validated against the target
 * list and `newPosition` is recomputed/validated server-side.
 */
export interface CardPlacement {
  /** Card the new card should land *after* (`null` = list head). */
  beforeCardId: string | null;
  /** Card the new card should land *before* (`null` = list tail). */
  afterCardId: string | null;
  /** Client-computed position; validated against the neighbours when given. */
  newPosition: string | undefined;
}

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
  /** Where the card lands; omitted → appended to the end of the list. */
  placement?: CardPlacement;
}

/**
 * Resolve the new fractional `position` for a card placed into `listId`.
 * Without `placement` (or with both neighbours `null`) the card is appended
 * after the list's highest-position card — active *and* archived, positions
 * are one sequence per list — or `firstPosition()` when the list is empty.
 * With neighbours, each given `before`/`after` must be an *active* card in
 * `listId` (`BAD_REQUEST` otherwise) and a client `newPosition` is validated
 * against them. Runs inside the caller's transaction. Mirrors `card.ts`'s
 * `resolveTargetListPosition` (the `card.moveToList` / `card.copy` helper).
 */
async function resolveCardPosition(
  tx: Queryable,
  listId: string,
  placement: CardPlacement | undefined,
): Promise<string> {
  const before = placement?.beforeCardId ?? null;
  const after = placement?.afterCardId ?? null;
  const newPosition = placement?.newPosition;

  if (before !== null || after !== null) {
    const neighbourIds = [before, after].filter((id): id is string => typeof id === 'string');
    const neighbours = await tx
      .select({
        id: cards.id,
        listId: cards.listId,
        archivedAt: cards.archivedAt,
        position: cards.position,
      })
      .from(cards)
      .where(inArray(cards.id, neighbourIds));
    const byId = new Map(neighbours.map((n) => [n.id, n] as const));
    const beforeCard = before ? byId.get(before) : undefined;
    const afterCard = after ? byId.get(after) : undefined;
    if (
      (before && (!beforeCard || beforeCard.listId !== listId || beforeCard.archivedAt !== null)) ||
      (after && (!afterCard || afterCard.listId !== listId || afterCard.archivedAt !== null))
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Komşu kartlar hedef listeye ait olmalı.',
      });
    }
    return resolveMovePosition(newPosition, beforeCard?.position ?? null, afterCard?.position ?? null);
  }

  // Append to the end of the list. Positions are a single sequence per list
  // (active + archived); place the new card right after the highest one.
  const [last] = await tx
    .select({ position: cards.position })
    .from(cards)
    .where(eq(cards.listId, listId))
    .orderBy(desc(cards.position))
    .limit(1);
  return resolveMovePosition(newPosition, last?.position ?? null, null);
}

export interface CreateCardResult {
  card: CreatedCard;
  /** Pass to `maybeEnqueueRealtimePublish` after the transaction commits. */
  realtimeEventId: string;
}

/**
 * Create a card in `list` inside the caller's transaction. Without
 * `args.placement` the card is appended to the end (the `card.create`
 * behaviour); with neighbours it lands at the resolved position (DEM-205).
 * Either way the side effects mirror `card.create` exactly: a `card.created`
 * activity event, a realtime outbox row, the `boards.version` bump and the
 * search-document upsert.
 */
export async function createCardInTransaction(
  tx: Queryable,
  args: CreateCardArgs,
): Promise<CreateCardResult> {
  const { list, board, title, actorId, clientMutationId, placement } = args;

  const position = await resolveCardPosition(tx, list.id, placement);

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
