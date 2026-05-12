/**
 * List router — Phase 2B (DEM-35): `list.create` / `list.update` (rename) /
 * `list.archive`; Phase 3A (DEM-42): `list.move` (reorder). Drag-drop UI lands
 * in Phase 3B; position compaction worker in Phase 3C; optimistic UI in
 * Phase 4; realtime publishing in Phase 5; notification outbox in Phase 6.
 *
 * Authorization is server-side: `boardProcedure` resolves the caller's effective
 * board role; the procedure body checks the finer role with
 * `@pusula/domain/permissions` (`canEditBoardContent` → board `member+`). Each
 * mutation's transaction contains only the domain change + the `activity_events`
 * insert + the `boards.version` bump (Phase 2/3A scope — `realtime_events` /
 * `notification_outbox` land in Phase 5/6). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası), `docs/architecture/03-backend.md` (Faz 2 / Faz 3 — list
 * procedure'leri) and `docs/architecture/05-board-mekanigi.md` §5.1.
 *
 * Phase 2 positions only ever *append*: a new list goes to the end of the board
 * (`firstPosition()` for an empty board, else `positionBetween(lastPos, null)`).
 * `list.move` (Phase 3A) reorders a list within its board: the new `position` is
 * either the client-supplied `newPosition` (validated against the target
 * neighbours) or `positionBetween(before, after)`.
 *
 * An archived board is read-only: no new lists, no renames, no reorders, no
 * archive flips on its lists. (An archived *list* may still be renamed — only
 * adding/moving cards into it is forbidden, see `card.ts`.)
 */
import { desc, eq, inArray, sql } from '@pusula/db';
import { activityEvents, boards, lists } from '@pusula/db';
import {
  archiveListInput,
  canEditBoardContent,
  createListInput,
  firstPosition,
  moveListInput,
  positionBetween,
  renameListInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { resolveMovePosition } from '../lib/position';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import { router } from '../trpc';

/** Columns of a full list row returned to clients. */
const listCols = {
  id: lists.id,
  boardId: lists.boardId,
  title: lists.title,
  position: lists.position,
  archivedAt: lists.archivedAt,
  createdAt: lists.createdAt,
  updatedAt: lists.updatedAt,
} as const;

export const listRouter = router({
  /**
   * Create a list at the end of the board. Board `member+` only. An archived
   * board rejects new lists. Writes a `list.created` activity event and bumps
   * `boards.version` in the same transaction. `beforeListId` / `afterListId` on
   * the input are accepted but ignored in Phase 2 (append-only) — placement
   * lands in Phase 3.
   */
  create: boardProcedure.input(createListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Liste oluşturma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      // Re-read the board inside the tx so an archive that landed between the
      // middleware read and here still wins (race-safe).
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Arşivli board'a liste eklenemez." });
      }

      // Highest-position list in the board (active *and* archived — positions are
      // a single sequence per board); place the new one right after it.
      const [last] = await tx
        .select({ position: lists.position })
        .from(lists)
        .where(eq(lists.boardId, ctx.board.id))
        .orderBy(desc(lists.position))
        .limit(1);
      const position = last ? positionBetween(last.position, null) : firstPosition();

      const [created] = await tx
        .insert(lists)
        .values({ boardId: ctx.board.id, title: input.title, position })
        .returning(listCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'list.created',
        payload: { listId: created.id, title: created.title, position: created.position },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      return created;
    });
  }),

  /**
   * Rename a list. Board `member+` only. An archived *board* is read-only; an
   * archived *list* may still be renamed (the domain only forbids adding/moving
   * cards into an archived list). Idempotent: if the title is unchanged, returns
   * `{ ..., changed: false }` without writing activity or bumping `version`.
   */
  update: boardProcedure.input(renameListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Listeyi düzenleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [list] = await tx
        .select(listCols)
        .from(lists)
        .where(eq(lists.id, input.listId))
        .limit(1);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
      }
      if (list.boardId !== ctx.board.id) {
        // The caller authenticated against `boardId` but referenced a list in
        // another board — inconsistent scope.
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Liste bu board'a ait değil." });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      if (list.title === input.title) {
        return { ...list, changed: false as const };
      }

      const [updated] = await tx
        .update(lists)
        .set({ title: input.title })
        .where(eq(lists.id, input.listId))
        .returning(listCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'list.renamed',
        payload: { listId: updated.id, fromTitle: list.title, toTitle: updated.title },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Archive (or restore) a list. Board `member+` only. `archived: true` sets
   * `archived_at = now()`; `false` clears it. An archived *board* is read-only.
   * Idempotent: a no-op flip returns `{ id, archivedAt, changed: false }`
   * without writing activity or bumping `version`. Writes a `list.archived`
   * activity event on a real change.
   */
  archive: boardProcedure.input(archiveListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Listeyi arşivleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [list] = await tx
        .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
        .from(lists)
        .where(eq(lists.id, input.listId))
        .limit(1);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
      }
      if (list.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Liste bu board'a ait değil." });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const isArchived = list.archivedAt !== null;
      if (isArchived === input.archived) {
        return { id: list.id, archivedAt: list.archivedAt, changed: false as const };
      }

      const nextArchivedAt = input.archived ? new Date() : null;
      const [updated] = await tx
        .update(lists)
        .set({ archivedAt: nextArchivedAt })
        .where(eq(lists.id, input.listId))
        .returning({ id: lists.id, archivedAt: lists.archivedAt });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'list.archived',
        payload: { listId: updated.id, archived: input.archived },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      return { id: updated.id, archivedAt: updated.archivedAt, changed: true as const };
    });
  }),

  /**
   * Reorder a list within its board (Phase 3A — DEM-42). Board `member+` only.
   * The new `position` is the client-supplied `newPosition` (validated against
   * the target neighbours `before`/`after`) or `positionBetween(before, after)`
   * when omitted. An archived *board* is read-only (`BAD_REQUEST`). Idempotent:
   * if the list is already at the resolved `position`, returns
   * `{ ..., changed: false }` without writing activity or bumping `version` — so
   * a duplicate-delivered `clientMutationId` is a natural no-op. Writes a
   * `list.moved` activity event (`{ listId, fromPosition, toPosition }`) on a
   * real change and bumps `boards.version`.
   */
  move: boardProcedure.input(moveListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Listeyi taşıma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const [list] = await tx.select(listCols).from(lists).where(eq(lists.id, input.listId)).limit(1);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
      }
      if (list.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Liste bu board'a ait değil." });
      }

      // A list cannot be positioned relative to itself (degenerate).
      if (input.beforeListId === input.listId || input.afterListId === input.listId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bir liste kendisine göre konumlandırılamaz.' });
      }

      // Load the target neighbours (each must belong to this board).
      const neighbourIds = [input.beforeListId, input.afterListId].filter(
        (id): id is string => typeof id === 'string',
      );
      const neighbours = neighbourIds.length
        ? await tx.select(listCols).from(lists).where(inArray(lists.id, neighbourIds))
        : [];
      const byId = new Map(neighbours.map((n) => [n.id, n] as const));

      const before = input.beforeListId ? byId.get(input.beforeListId) : undefined;
      const after = input.afterListId ? byId.get(input.afterListId) : undefined;
      if (
        (input.beforeListId && (!before || before.boardId !== ctx.board.id)) ||
        (input.afterListId && (!after || after.boardId !== ctx.board.id))
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Komşu listeler bu board'a ait olmalı." });
      }

      const position = resolveMovePosition(
        input.newPosition,
        before?.position ?? null,
        after?.position ?? null,
      );
      // TODO(DEM-44/Faz 3C): position uzunluğu POSITION_COMPACTION_MAX_LEN'i aşarsa
      // compaction job enqueue (worker'a bağlanır; Faz 3A worker'a bağlı değil).

      if (list.position === position) {
        return { ...list, changed: false as const };
      }

      const [updated] = await tx
        .update(lists)
        .set({ position })
        .where(eq(lists.id, input.listId))
        .returning(listCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'list.moved',
        payload: { listId: updated.id, fromPosition: list.position, toPosition: updated.position },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      return { ...updated, changed: true as const };
    });
  }),
});
