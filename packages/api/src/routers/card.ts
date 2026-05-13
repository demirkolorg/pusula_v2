/**
 * Card router — Phase 2C (DEM-36): `card.create` / `card.get` / `card.update` /
 * `card.archive`; Phase 3A (DEM-42): `card.move` (within / across lists, same
 * board). Drag-drop UI lands in Phase 3B; cross-board `card.moveToList` /
 * `card.copy` in Phase 3E; optimistic UI in Phase 4; realtime publishing in
 * Phase 5; notification outbox in Phase 6.
 *
 * Authorization is server-side:
 * - `card.create` runs on `protectedProcedure` (it only carries `listId`, so it
 *   resolves the list's board itself via `resolveBoardAccess`), then requires
 *   board `member+` (`canEditBoardContent`).
 * - `card.get` runs on `cardProcedure` (board visibility ⇒ `viewer+` already
 *   enforced); the explicit `canViewBoard` check is kept for clarity.
 * - `card.update` / `card.archive` / `card.complete` / `card.uncomplete` /
 *   `card.move` run on `cardProcedure` and require board `member+`
 *   (`canEditBoardContent`).
 *
 * Each mutation's transaction contains only the domain change + the
 * `activity_events` insert(s) + the `boards.version` bump (Phase 2/3A scope —
 * `realtime_events` / `notification_outbox` land in Phase 5/6). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası), `docs/architecture/03-backend.md` and
 * `docs/architecture/05-board-mekanigi.md` §5.1.
 *
 * Invariant: a card lives in exactly one list, and `card.boardId === list.boardId`
 * (set at insert time from the list's board, preserved by `card.move` which only
 * moves within a board). Phase 2 positions only ever *append*: a new card goes to
 * the end of its list. `card.move` (Phase 3A) reorders / re-parents a card within
 * its board; cross-board moves are `card.moveToList` (Phase 3E). An archived
 * *board* is read-only (no new cards, no edits, no moves); an archived *list*
 * rejects new cards *and* cards moved *into* it — but a card may still be moved
 * *out of* an archived list (Trello semantics: you can drag a card out of an
 * archived list); an archived list's existing cards may still be edited/archived.
 *
 * `activity_events` taxonomy (per `docs/architecture/03-backend.md`):
 * `card.create` → `card.created`; `card.update`: title → `card.renamed`,
 * description → `card.description_changed`, `due_at` set → `card.due_set` /
 * cleared → `card.due_cleared`, cover colour set → `card.cover_changed` /
 * cleared → `card.cover_cleared`; `card.archive` → `card.archived`;
 * `card.complete` → `card.completed`; `card.uncomplete` → `card.uncompleted`;
 * `card.move` → `card.moved` (`{ cardId, fromListId, toListId, fromPosition,
 * toPosition }`).
 *
 * Phase 2.7 (DEM-66 / DEM-67): `card.complete` / `card.uncomplete` toggle the
 * `completed` / `completed_at` / `completed_by` columns; `card.update` also
 * accepts `coverColor` (one of the 12 palette names, or `null` to clear).
 */
import { and, asc, desc, eq, inArray, sql } from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  lists,
  users,
  workspaceMembers,
} from '@pusula/db';
import {
  archiveCardInput,
  canEditBoardContent,
  canViewBoard,
  completeCardInput,
  copyCardInput,
  createCardInput,
  effectiveBoardRole,
  firstPosition,
  moveCardInput,
  moveCardToListInput,
  positionBetween,
  uncompleteCardInput,
  updateCardInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { compactionScopeKey, maybeEnqueueCompaction } from '../lib/compaction';
import { resolveMovePosition } from '../lib/position';
import { accessFromBoardRole } from '../middleware/board';
import { type Queryable, resolveBoardAccess } from '../middleware/board-access';
import { cardProcedure } from '../middleware/card';
import { protectedProcedure, router } from '../trpc';
import { cardLabelsRouter } from './card-labels';
import { cardMembersRouter } from './card-members';

/** Columns of a full card row returned to clients. */
const cardCols = {
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
  archivedAt: cards.archivedAt,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
} as const;

/**
 * Resolve the new fractional `position` for a card placed into `toListId`
 * (Phase 3E `card.moveToList` / `card.copy`). When `beforeCardId` / `afterCardId`
 * are given, each must be an *active* card in `toListId` (else `BAD_REQUEST`),
 * and a client-supplied `newPosition` is validated against those neighbours.
 * When neither neighbour is given, the card is appended to the end of `toListId`
 * (after the highest-position card, or `firstPosition()` when the list is
 * empty); `excludeCardId` (the moving card, for `moveToList`) is ignored when
 * computing that tail. Runs inside the caller's transaction.
 */
async function resolveTargetListPosition(
  tx: Queryable,
  args: {
    toListId: string;
    beforeCardId: string | null;
    afterCardId: string | null;
    newPosition: string | undefined;
    excludeCardId: string | null;
  },
): Promise<string> {
  const { toListId, beforeCardId, afterCardId, newPosition, excludeCardId } = args;
  const neighbourIds = [beforeCardId, afterCardId].filter((id): id is string => typeof id === 'string');
  if (neighbourIds.length > 0) {
    const neighbours = await tx
      .select({ id: cards.id, listId: cards.listId, archivedAt: cards.archivedAt, position: cards.position })
      .from(cards)
      .where(inArray(cards.id, neighbourIds));
    const byId = new Map(neighbours.map((n) => [n.id, n] as const));
    const before = beforeCardId ? byId.get(beforeCardId) : undefined;
    const after = afterCardId ? byId.get(afterCardId) : undefined;
    if (
      (beforeCardId && (!before || before.listId !== toListId || before.archivedAt !== null)) ||
      (afterCardId && (!after || after.listId !== toListId || after.archivedAt !== null))
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Komşu kartlar hedef listeye ait olmalı.' });
    }
    return resolveMovePosition(newPosition, before?.position ?? null, after?.position ?? null);
  }

  // Append to the end of the list. Positions are a single sequence per list
  // (active + archived); place the new card right after the highest one.
  const tail = await tx
    .select({ id: cards.id, position: cards.position })
    .from(cards)
    .where(eq(cards.listId, toListId))
    .orderBy(desc(cards.position))
    .limit(2);
  const last = tail.find((c) => c.id !== excludeCardId);
  const lastPos = last?.position ?? null;
  return resolveMovePosition(newPosition, lastPos, null);
}

/**
 * Whether `userId` has *effective* access to `boardId` (an explicit
 * `board_members` row, or inherited from a `workspace_members` role —
 * `effectiveBoardRole !== null`). Used by `card.copy` to filter copied
 * `card_members` to those who can actually reach the target board (invariant 12).
 * Runs inside the caller's transaction.
 */
async function hasEffectiveBoardAccess(
  tx: Queryable,
  workspaceId: string,
  boardId: string,
  userId: string,
): Promise<boolean> {
  const [wsMember] = await tx
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!wsMember) return false;
  const [boardMember] = await tx
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .limit(1);
  return effectiveBoardRole({ workspaceRole: wsMember.role, boardRole: boardMember?.role ?? null }) !== null;
}

export const cardRouter = router({
  /**
   * Create a card at the end of a list. Board `member+` only. The list's board
   * must be active and the list itself must not be archived. Writes a
   * `card.created` activity event and bumps `boards.version` in the same
   * transaction. `beforeCardId` / `afterCardId` on the input are accepted but
   * ignored in Phase 2 (append-only) — placement lands in Phase 3.
   */
  create: protectedProcedure.input(createCardInput).mutation(async ({ ctx, input }) => {
    return ctx.db.transaction(async (tx) => {
      const [list] = await tx
        .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
        .from(lists)
        .where(eq(lists.id, input.listId))
        .limit(1);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
      }

      const board = await resolveBoardAccess(tx, list.boardId, ctx.session.user.id);
      if (!canEditBoardContent(accessFromBoardRole(board.role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Kart oluşturma yetkiniz yok.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Arşivli board'a kart eklenemez." });
      }
      if (list.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart eklenemez.' });
      }

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
        .values({ boardId: list.boardId, listId: list.id, title: input.title, position })
        .returning(cardCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: board.workspaceId,
        boardId: list.boardId,
        cardId: created.id,
        actorId: ctx.session.user.id,
        type: 'card.created',
        payload: {
          cardId: created.id,
          listId: list.id,
          title: created.title,
          position: created.position,
          clientMutationId: ctx.clientMutationId,
        },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, list.boardId));

      return created;
    });
  }),

  /**
   * Read a single card + the caller's `card_members` relationships. Board
   * `viewer+` (already enforced by `cardProcedure`). No transaction (read-only).
   */
  get: cardProcedure.query(async ({ ctx }) => {
    if (!canViewBoard(accessFromBoardRole(ctx.card.boardRole))) {
      // Unreachable in practice — `cardProcedure` already enforces viewer+ — but
      // makes the authorization explicit.
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu kartı görüntüleme yetkiniz yok.' });
    }

    const [card] = await ctx.db.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
    if (!card) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
    }

    return { card, relations: ctx.card.relations };
  }),

  /**
   * Update a card's title / description / due date / cover colour. Board
   * `member+` only. At least one of `title` / `description` / `dueAt` /
   * `coverColor` must be present (`dueAt: null` / `coverColor: null` count as
   * changes — "clear the due date" / "clear the cover colour"). An archived
   * *board* is read-only; an archived *list*'s cards may still be edited (only
   * `card.move` is blocked). Idempotent per field: if nothing actually changes,
   * returns `{ ..., changed: false }` without writing activity or bumping
   * `version`. Writes one `activity_events` row per changed field: title →
   * `card.renamed`, description → `card.description_changed` (flag only — the
   * body is not put in the payload), `dueAt` → `card.due_set` (when the new
   * value is non-null) or `card.due_cleared`, `coverColor` → `card.cover_changed`
   * (new value non-null) or `card.cover_cleared`.
   */
  update: cardProcedure.input(updateCardInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı düzenleme yetkiniz yok.' });
    }
    const wantsTitle = input.title !== undefined;
    const wantsDescription = input.description !== undefined;
    const wantsDueAt = 'dueAt' in input; // `dueAt: null` is a real change → key presence, not value.
    const wantsCoverColor = 'coverColor' in input; // `coverColor: null` is a real change → key presence.
    if (!wantsTitle && !wantsDescription && !wantsDueAt && !wantsCoverColor) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const dueAtChanged =
        wantsDueAt && (card.dueAt?.getTime() ?? null) !== (input.dueAt?.getTime() ?? null);
      // Normalise an empty description to `null` so `""` and a missing
      // description are the same "no description" — only a real text change
      // writes activity.
      const nextDescription: string | null | undefined = wantsDescription
        ? input.description
          ? input.description
          : null
        : undefined;
      const titleChanged = wantsTitle && input.title !== card.title;
      const descriptionChanged =
        wantsDescription && (nextDescription ?? null) !== (card.description ?? null);
      const coverColorChanged =
        wantsCoverColor && (card.coverColor ?? null) !== (input.coverColor ?? null);

      const patch: Partial<typeof cards.$inferInsert> = {};
      if (titleChanged) patch.title = input.title;
      if (descriptionChanged) patch.description = nextDescription ?? null;
      if (dueAtChanged) patch.dueAt = input.dueAt ?? null;
      if (coverColorChanged) patch.coverColor = input.coverColor ?? null;

      if (Object.keys(patch).length === 0) {
        return { ...card, changed: false as const };
      }

      const [updated] = await tx
        .update(cards)
        .set(patch)
        .where(eq(cards.id, ctx.card.id))
        .returning(cardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (titleChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: 'card.renamed',
          payload: { cardId: card.id, fromTitle: card.title, toTitle: updated.title, clientMutationId: ctx.clientMutationId },
        });
      }
      if (descriptionChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: 'card.description_changed',
          payload: { cardId: card.id, clientMutationId: ctx.clientMutationId },
        });
      }
      if (dueAtChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: updated.dueAt ? 'card.due_set' : 'card.due_cleared',
          payload: updated.dueAt
            ? { cardId: card.id, dueAt: updated.dueAt, clientMutationId: ctx.clientMutationId }
            : { cardId: card.id, fromDueAt: card.dueAt, clientMutationId: ctx.clientMutationId },
        });
      }
      if (coverColorChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: updated.coverColor ? 'card.cover_changed' : 'card.cover_cleared',
          payload: updated.coverColor
            ? { cardId: card.id, coverColor: updated.coverColor, clientMutationId: ctx.clientMutationId }
            : { cardId: card.id, fromCoverColor: card.coverColor, clientMutationId: ctx.clientMutationId },
        });
      }

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Archive (or restore) a card. Board `member+` only. `archived: true` sets
   * `archived_at = now()`; `false` clears it. An archived *board* is read-only.
   * Idempotent: a no-op flip returns `{ id, archivedAt, changed: false }`
   * without writing activity or bumping `version`. Writes a `card.archived`
   * activity event on a real change.
   */
  archive: cardProcedure.input(archiveCardInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı arşivleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          listId: cards.listId,
          archivedAt: cards.archivedAt,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const isArchived = card.archivedAt !== null;
      if (isArchived === input.archived) {
        return { id: card.id, archivedAt: card.archivedAt, changed: false as const };
      }

      const nextArchivedAt = input.archived ? new Date() : null;
      const [updated] = await tx
        .update(cards)
        .set({ archivedAt: nextArchivedAt })
        .where(eq(cards.id, ctx.card.id))
        .returning({ id: cards.id, archivedAt: cards.archivedAt });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.archived',
        payload: { cardId: card.id, archived: input.archived, clientMutationId: ctx.clientMutationId },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { id: updated.id, archivedAt: updated.archivedAt, changed: true as const };
    });
  }),

  /**
   * Mark a card complete (Phase 2.7 — DEM-66). Board `member+` only. Sets
   * `completed = true`, `completed_at = now()`, `completed_by = caller`. An
   * archived *board* is read-only. Idempotent: an already-completed card returns
   * `{ ..., changed: false }` without writing activity or bumping `version`.
   * Writes a `card.completed` activity event on a real change.
   */
  complete: cardProcedure.input(completeCardInput).mutation(async ({ ctx }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı tamamlama yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      if (card.completed) {
        return {
          id: card.id,
          completed: card.completed,
          completedAt: card.completedAt,
          completedBy: card.completedBy,
          changed: false as const,
        };
      }

      const now = new Date();
      const [updated] = await tx
        .update(cards)
        .set({ completed: true, completedAt: now, completedBy: ctx.session.user.id })
        .where(eq(cards.id, ctx.card.id))
        .returning({
          id: cards.id,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.completed',
        payload: { cardId: card.id, clientMutationId: ctx.clientMutationId },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Clear a card's completion (Phase 2.7 — DEM-66). Board `member+` only. Sets
   * `completed = false`, `completed_at = null`, `completed_by = null`. An
   * archived *board* is read-only. Idempotent: an already-incomplete card returns
   * `{ ..., changed: false }` without writing activity or bumping `version`.
   * Writes a `card.uncompleted` activity event on a real change.
   */
  uncomplete: cardProcedure.input(uncompleteCardInput).mutation(async ({ ctx }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartın tamamlanmasını geri alma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      if (!card.completed) {
        return {
          id: card.id,
          completed: card.completed,
          completedAt: card.completedAt,
          completedBy: card.completedBy,
          changed: false as const,
        };
      }

      const [updated] = await tx
        .update(cards)
        .set({ completed: false, completedAt: null, completedBy: null })
        .where(eq(cards.id, ctx.card.id))
        .returning({
          id: cards.id,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.uncompleted',
        payload: { cardId: card.id, clientMutationId: ctx.clientMutationId },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Move a card within its board (Phase 3A — DEM-42): reorder inside the same
   * list (`toListId === fromListId`) or re-parent it to another list of the same
   * board. Board `member+` only.
   *
   * Flow (inside one transaction):
   *  1. Re-read the card → `NOT_FOUND` if gone.
   *  2. `card.listId !== input.fromListId` → `CONFLICT` (a concurrent move beat
   *     this one; the client refetches the board rather than losing the card).
   *  3. Load `input.toListId` → `NOT_FOUND` if missing; it must belong to the
   *     card's board (`BAD_REQUEST` otherwise — cross-board moves are
   *     `card.moveToList`, Phase 3E) and must not be archived (`BAD_REQUEST` —
   *     no cards *into* an archived list; moving *out of* one is allowed).
   *  4. Re-read the board → an archived *board* is read-only (`BAD_REQUEST`).
   *  5. Load the target `before`/`after` cards (each must be in `toListId` and
   *     not archived — active cards are ordered among themselves); the new
   *     `position` is the client-supplied `newPosition` (validated against the
   *     neighbours) or `positionBetween(before, after)`.
   *  6. No-op / idempotent: if the card is already in `toListId` *and* at the
   *     resolved `position`, return `{ ..., changed: false }` without writing
   *     activity or bumping `version` — a duplicate-delivered `clientMutationId`
   *     is a natural no-op.
   *  7. Otherwise update `cards.list_id` + `cards.position` (`board_id` is
   *     unchanged — same board), write a `card.moved` activity event and bump
   *     `boards.version`.
   */
  move: cardProcedure.input(moveCardInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı taşıma yetkiniz yok.' });
    }

    const result = await ctx.db.transaction(async (tx) => {
      // Advisory lock keyed identically to the compaction job's `compactionScopeKey`
      // (`apps/worker/src/jobs/compaction.ts`) — moves and compaction on the same
      // scope serialize. Scope = target list (`toListId`): that is the list whose
      // card positions change. The source list's remaining cards keep their positions
      // on a cross-list move, so one lock on `toListId` is sufficient.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${compactionScopeKey({ kind: 'list', listId: input.toListId })}))`);

      const [card] = await tx
        .select({
          id: cards.id,
          listId: cards.listId,
          boardId: cards.boardId,
          archivedAt: cards.archivedAt,
          position: cards.position,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      // Concurrent move: the client's neighbours are stale → tell it to refetch
      // (don't silently relocate the card from someone else's move).
      if (card.listId !== input.fromListId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Kart artık bu listede değil; pano yenileniyor.',
        });
      }

      const [toList] = await tx
        .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
        .from(lists)
        .where(eq(lists.id, input.toListId))
        .limit(1);
      if (!toList) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hedef liste bulunamadı.' });
      }
      if (toList.boardId !== card.boardId) {
        // Cross-board moves are `card.moveToList` (Phase 3E — they also change
        // `cards.board_id` and re-check authorization on the target board).
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Kart başka bir board'a taşınamaz." });
      }
      if (toList.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart taşınamaz.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      // A card cannot be positioned relative to itself (degenerate).
      if (input.beforeCardId === card.id || input.afterCardId === card.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bir kart kendisine göre konumlandırılamaz.' });
      }

      // Target neighbours: each must be an *active* card in `toListId`.
      const neighbourIds = [input.beforeCardId, input.afterCardId].filter(
        (id): id is string => typeof id === 'string',
      );
      const neighbours = neighbourIds.length
        ? await tx
            .select({ id: cards.id, listId: cards.listId, archivedAt: cards.archivedAt, position: cards.position })
            .from(cards)
            .where(inArray(cards.id, neighbourIds))
        : [];
      const byId = new Map(neighbours.map((n) => [n.id, n] as const));

      const before = input.beforeCardId ? byId.get(input.beforeCardId) : undefined;
      const after = input.afterCardId ? byId.get(input.afterCardId) : undefined;
      if (
        (input.beforeCardId &&
          (!before || before.listId !== input.toListId || before.archivedAt !== null)) ||
        (input.afterCardId &&
          (!after || after.listId !== input.toListId || after.archivedAt !== null))
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Komşu kartlar hedef listeye ait olmalı.' });
      }

      const position = resolveMovePosition(
        input.newPosition,
        before?.position ?? null,
        after?.position ?? null,
      );

      if (card.listId === input.toListId && card.position === position) {
        const [current] = await tx.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
        return { ...current, changed: false as const };
      }

      const [updated] = await tx
        .update(cards)
        .set({ listId: input.toListId, position })
        .where(eq(cards.id, ctx.card.id))
        .returning(cardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.moved',
        payload: {
          cardId: card.id,
          fromListId: input.fromListId,
          toListId: input.toListId,
          fromPosition: card.position,
          toPosition: updated.position,
          clientMutationId: ctx.clientMutationId,
        },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });

    // After commit (best-effort, fire-and-forget): if the new fractional key is
    // long enough, queue a background re-balance of the *target* list's cards
    // (a within-list reorder targets that same list).
    if (result.changed) {
      maybeEnqueueCompaction(ctx, { kind: 'list', listId: input.toListId }, [result.position]);
    }

    return result;
  }),

  /**
   * Move a card to **any** list — the same board or another board (Phase 3E —
   * DEM-69; Trello's card ⋮ "Move"). Unlike `card.move` (Phase 3A,
   * board-internal), `toListId` may belong to a different board; a cross-board
   * move also updates `cards.board_id` and re-checks the caller's permission on
   * the *target* board. Board `member+` on both the source board (the card's
   * board) and the target board.
   *
   * Flow (inside one transaction):
   *  1. Load `toListId` → `NOT_FOUND` if missing; an archived target *list*
   *     rejects (`BAD_REQUEST` — no cards *into* an archived list).
   *  2. Resolve the caller's access to the target board (`resolveBoardAccess` —
   *     propagates `NOT_FOUND` / `FORBIDDEN` if the caller can't reach it);
   *     require board `member+` (else `FORBIDDEN`); an archived target *board*
   *     rejects (`BAD_REQUEST`). Re-read the source board's archive flag too — an
   *     archived *source* board is read-only.
   *  3. Advisory lock the target-list compaction scope (serializes with the
   *     compaction worker — same key as `card.move`).
   *  4. Re-read the card → `NOT_FOUND` if gone. (An archived *card* may still be
   *     moved — only an archived board blocks; matches `card.move`.)
   *  5. Resolve the new `position`: from the supplied `beforeCardId` /
   *     `afterCardId` (each must be an *active* card in `toListId`), or — when
   *     neither is given — appended to the end of `toListId`. A client-supplied
   *     `newPosition` is validated against the neighbours.
   *  6. No-op / idempotent: already in `toListId` at the resolved `position` →
   *     `{ ..., changed: false }`, no activity, no version bump (a duplicate
   *     `clientMutationId` after the card already arrived is a natural no-op).
   *  7. Otherwise update `cards.list_id` + `cards.position` (+ `cards.board_id`
   *     when cross-board). **Cross-board:** delete this card's `card_labels`
   *     rows (labels are board-scoped — invariant 16); `card_members` are kept;
   *     `checklists` / `checklist_items` / `comments` / `activity_events` follow
   *     the card automatically (they have no `board_id`). Write a `card.moved`
   *     activity event (payload carries `fromBoardId` / `toBoardId` only on a
   *     cross-board move) on the target board; bump `boards.version` on the
   *     target board, and — when cross-board — on the source board too.
   */
  moveToList: cardProcedure.input(moveCardToListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı taşıma yetkiniz yok.' });
    }

    const result = await ctx.db.transaction(async (tx) => {
      const [toList] = await tx
        .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
        .from(lists)
        .where(eq(lists.id, input.toListId))
        .limit(1);
      if (!toList) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hedef liste bulunamadı.' });
      }
      if (toList.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart taşınamaz.' });
      }

      // Target-board access (may differ from the source board). `resolveBoardAccess`
      // propagates `NOT_FOUND` / `FORBIDDEN` if the caller can't reach it.
      const targetBoard = await resolveBoardAccess(tx, toList.boardId, ctx.session.user.id);
      if (!canEditBoardContent(accessFromBoardRole(targetBoard.role))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Hedef board'da düzenleme yetkiniz yok.",
        });
      }
      if (targetBoard.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      // Re-read the source board's archive flag inside the tx (the middleware's
      // value could be stale). When source === target this is the same row.
      const [sourceBoard] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.card.boardId))
        .limit(1);
      if (!sourceBoard) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (sourceBoard.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      // Advisory lock keyed identically to the compaction job's `compactionScopeKey`
      // — scope = target list (the list whose card positions change). For a
      // cross-list move the source list's remaining cards keep their positions,
      // so one lock on `toListId` is sufficient.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${compactionScopeKey({ kind: 'list', listId: input.toListId })}))`,
      );

      const [card] = await tx
        .select({
          id: cards.id,
          listId: cards.listId,
          boardId: cards.boardId,
          position: cards.position,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      // A card cannot be positioned relative to itself (degenerate).
      if (input.beforeCardId === card.id || input.afterCardId === card.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bir kart kendisine göre konumlandırılamaz.',
        });
      }

      const position = await resolveTargetListPosition(tx, {
        toListId: input.toListId,
        beforeCardId: input.beforeCardId ?? null,
        afterCardId: input.afterCardId ?? null,
        newPosition: input.newPosition,
        excludeCardId: card.id,
      });

      const crossBoard = card.boardId !== toList.boardId;

      if (card.listId === input.toListId && card.position === position) {
        const [current] = await tx.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
        return { ...current, changed: false as const };
      }

      const [updated] = await tx
        .update(cards)
        .set({ listId: input.toListId, position, ...(crossBoard ? { boardId: toList.boardId } : {}) })
        .where(eq(cards.id, ctx.card.id))
        .returning(cardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (crossBoard) {
        // Labels are board-scoped (invariant 16) — drop this card's links. Members,
        // checklists, checklist items, comments and activity rows are keyed only by
        // `card_id`, so they follow the card automatically.
        await tx.delete(cardLabels).where(eq(cardLabels.cardId, card.id));
      }

      await tx.insert(activityEvents).values({
        // The card now lives in the target board's workspace — record the activity
        // there (its new home).
        workspaceId: targetBoard.workspaceId,
        boardId: toList.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.moved',
        payload: {
          cardId: card.id,
          fromListId: card.listId,
          toListId: input.toListId,
          fromPosition: card.position,
          toPosition: updated.position,
          clientMutationId: ctx.clientMutationId,
          ...(crossBoard ? { fromBoardId: card.boardId, toBoardId: toList.boardId } : {}),
        },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, toList.boardId));
      if (crossBoard) {
        await tx
          .update(boards)
          .set({ version: sql`${boards.version} + 1` })
          .where(eq(boards.id, card.boardId));
      }

      return { ...updated, changed: true as const };
    });

    if (result.changed) {
      maybeEnqueueCompaction(ctx, { kind: 'list', listId: input.toListId }, [result.position]);
    }

    return result;
  }),

  /**
   * Copy a card to **any** list — the same board or another board (Phase 3E —
   * DEM-69; Trello's card ⋮ "Copy"). Board `viewer+` on the source board
   * (already enforced by `cardProcedure`) and board `member+` on the target
   * board. NOT idempotent — every call creates a new card (`clientMutationId` is
   * carried but there's no dedup, like `card.create`).
   *
   * Always copied: `title` (defaults to the source title + " (kopya)"),
   * `description`, `due_at`, `cover_color`. Always reset on the copy:
   * `completed` / `completed_at` / `completed_by`. Opt-in:
   *  - `includeChecklists` → `checklists` + `checklist_items` are copied,
   *    preserving order; items are reset to unchecked (`completed = false`,
   *    `completed_at` / `completed_by` null).
   *  - `includeMembers` → `card_members` are copied, filtered to users with
   *    effective access to the target board (`effectiveBoardRole !== null` —
   *    invariant 12 applies to a *create*).
   *  - `includeLabels` → `card_labels` are copied **only when the target board
   *    equals the source board** (labels are board-scoped; cross-board copies
   *    skip labels entirely).
   * Never copied: `comments`, `activity_events`.
   *
   * Flow (inside one transaction):
   *  1. Load `toListId` → `NOT_FOUND` if missing; archived target list →
   *     `BAD_REQUEST`.
   *  2. Resolve the caller's access to the target board (`resolveBoardAccess`);
   *     require `member+` (else `FORBIDDEN`); archived target board →
   *     `BAD_REQUEST`.
   *  3. Advisory lock the target-list compaction scope.
   *  4. Re-read the source card's row inside the tx.
   *  5. Resolve the new `position` (from `beforeCardId` / `afterCardId`, or
   *     appended to the end of `toListId`).
   *  6. Insert the new card; copy the opt-in sub-rows; write a `card.created`
   *     activity event (payload carries `copiedFromCardId`) on the target board;
   *     bump `boards.version` on the target board.
   */
  copy: cardProcedure.input(copyCardInput).mutation(async ({ ctx, input }) => {
    // `cardProcedure` already guarantees the caller can view the source board
    // (`viewer+`); the explicit check makes the authorization intent obvious.
    if (!canViewBoard(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu kartı görüntüleme yetkiniz yok.' });
    }

    const result = await ctx.db.transaction(async (tx) => {
      const [toList] = await tx
        .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
        .from(lists)
        .where(eq(lists.id, input.toListId))
        .limit(1);
      if (!toList) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hedef liste bulunamadı.' });
      }
      if (toList.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart eklenemez.' });
      }

      const targetBoard = await resolveBoardAccess(tx, toList.boardId, ctx.session.user.id);
      if (!canEditBoardContent(accessFromBoardRole(targetBoard.role))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Hedef board'da kart oluşturma yetkiniz yok.",
        });
      }
      if (targetBoard.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${compactionScopeKey({ kind: 'list', listId: input.toListId })}))`,
      );

      const [source] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          title: cards.title,
          description: cards.description,
          dueAt: cards.dueAt,
          coverColor: cards.coverColor,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const position = await resolveTargetListPosition(tx, {
        toListId: input.toListId,
        beforeCardId: input.beforeCardId ?? null,
        afterCardId: input.afterCardId ?? null,
        newPosition: undefined,
        excludeCardId: null,
      });

      const [created] = await tx
        .insert(cards)
        .values({
          boardId: toList.boardId,
          listId: input.toListId,
          title: input.title ?? `${source.title} (kopya)`,
          description: source.description,
          dueAt: source.dueAt,
          coverColor: source.coverColor,
          completed: false,
          completedAt: null,
          completedBy: null,
          position,
        })
        .returning(cardCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (input.includeChecklists) {
        const sourceChecklists = await tx
          .select({ id: checklists.id, title: checklists.title, position: checklists.position })
          .from(checklists)
          .where(eq(checklists.cardId, source.id))
          .orderBy(asc(checklists.position));
        for (const cl of sourceChecklists) {
          const [newChecklist] = await tx
            .insert(checklists)
            .values({ cardId: created.id, title: cl.title, position: cl.position })
            .returning({ id: checklists.id });
          if (!newChecklist) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          const items = await tx
            .select({ content: checklistItems.content, position: checklistItems.position })
            .from(checklistItems)
            .where(eq(checklistItems.checklistId, cl.id))
            .orderBy(asc(checklistItems.position));
          if (items.length > 0) {
            await tx.insert(checklistItems).values(
              items.map((it) => ({
                checklistId: newChecklist.id,
                content: it.content,
                position: it.position,
                completed: false,
                completedAt: null,
                completedBy: null,
              })),
            );
          }
        }
      }

      if (input.includeMembers) {
        const sourceMembers = await tx
          .select({ userId: cardMembers.userId, role: cardMembers.role })
          .from(cardMembers)
          .where(eq(cardMembers.cardId, source.id));
        for (const m of sourceMembers) {
          if (!(await hasEffectiveBoardAccess(tx, targetBoard.workspaceId, toList.boardId, m.userId))) {
            continue;
          }
          await tx
            .insert(cardMembers)
            .values({ cardId: created.id, userId: m.userId, role: m.role })
            .onConflictDoNothing();
        }
      }

      if (input.includeLabels && source.boardId === toList.boardId) {
        const sourceLabels = await tx
          .select({ labelId: cardLabels.labelId })
          .from(cardLabels)
          .where(eq(cardLabels.cardId, source.id));
        if (sourceLabels.length > 0) {
          await tx
            .insert(cardLabels)
            .values(sourceLabels.map((l) => ({ cardId: created.id, labelId: l.labelId })))
            .onConflictDoNothing();
        }
      }

      await tx.insert(activityEvents).values({
        workspaceId: targetBoard.workspaceId,
        boardId: toList.boardId,
        cardId: created.id,
        actorId: ctx.session.user.id,
        type: 'card.created',
        payload: {
          cardId: created.id,
          listId: input.toListId,
          title: created.title,
          position: created.position,
          copiedFromCardId: source.id,
          clientMutationId: ctx.clientMutationId,
        },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, toList.boardId));

      return created;
    });

    maybeEnqueueCompaction(ctx, { kind: 'list', listId: input.toListId }, [result.position]);

    return result;
  }),

  /** Card members (`assignee` / `watcher`) — `card.members.{list,add,remove}`. */
  members: cardMembersRouter,

  /** Card ↔ label links — `card.labels.{list,add,remove}`. */
  labels: cardLabelsRouter,

  /** Card activity feed — `card.activity.list`. */
  activity: router({
    /**
     * List a card's `activity_events`, newest first, capped at 50, joined with
     * the actor's display name. Board `viewer+` (already enforced by
     * `cardProcedure`). No transaction (read-only).
     */
    list: cardProcedure.query(async ({ ctx }) => {
      return ctx.db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          actorId: activityEvents.actorId,
          actorName: users.name,
          payload: activityEvents.payload,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .leftJoin(users, eq(users.id, activityEvents.actorId))
        .where(eq(activityEvents.cardId, ctx.card.id))
        .orderBy(desc(activityEvents.createdAt))
        .limit(50);
    }),
  }),
});
