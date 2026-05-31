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
 * An archived board is read-only: no new lists, no list updates, no reorders,
 * no archive flips on its lists. DEM-98 also treats an archived *list* as
 * read-only for `list.update`.
 */
import { desc, eq, inArray, sql } from '@pusula/db';
import { activityEvents, boards, cards, lists } from '@pusula/db';
import {
  archiveListInput,
  canEditBoardContent,
  canManageBoard,
  createListInput,
  deleteListInput,
  firstPosition,
  moveListInput,
  positionBetween,
  updateListInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import { compactionScopeKey, maybeEnqueueCompaction } from '../lib/compaction';
import { resolveMovePosition } from '../lib/position';
import { insertRealtimeEvent, maybeEnqueueRealtimePublish } from '../lib/realtime-publish';
import {
  deleteSearchDocument,
  syncSearchDocumentsForScope,
  upsertSearchDocument,
} from '../lib/search-indexer';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import { router } from '../trpc';

/** Columns of a full list row returned to clients. */
const listCols = {
  id: lists.id,
  boardId: lists.boardId,
  title: lists.title,
  color: lists.color,
  icon: lists.icon,
  iconColor: lists.iconColor,
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

    let realtimeEventId: string | undefined;
    const created = await ctx.db.transaction(async (tx) => {
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
      assertNotArchived('board', board, "Arşivli board'a liste eklenemez.");

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
        payload: {
          listId: created.id,
          title: created.title,
          position: created.position,
          clientMutationId: ctx.clientMutationId,
        },
      });

      const [bumped] = await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ version: boards.version });

      // Faz 5B (DEM-84) — realtime outbox insert in the same tx; enqueue after
      // commit. `seq` mirrors the freshly-bumped `boards.version`.
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'list.created',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: bumped?.version ?? 0,
        data: {
          listId: created.id,
          title: created.title,
          position: created.position,
        },
      });

      await upsertSearchDocument(tx, { entityType: 'list', entityId: created.id });

      return created;
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return created;
  }),

  /**
   * Update a list's title and/or colour. Board `member+` only. An archived
   * board or list is read-only. Idempotent: if no requested field actually
   * changes, returns
   * `{ ..., changed: false }` without writing activity, realtime outbox, or
   * bumping `version`.
   */
  update: boardProcedure.input(updateListInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Listeyi düzenleme yetkiniz yok.' });
    }

    const wantsTitle = input.title !== undefined;
    const wantsColor = input.color !== undefined;
    const wantsIcon = input.icon !== undefined;
    const wantsIconColor = input.iconColor !== undefined;
    if (!wantsTitle && !wantsColor && !wantsIcon && !wantsIconColor) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin.' });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
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
      assertNotArchived('board', board);
      assertNotArchived('list', list);

      const titleChanged = wantsTitle && input.title !== list.title;
      const colorChanged = wantsColor && (list.color ?? null) !== (input.color ?? null);
      const nextIcon = wantsIcon ? (input.icon ?? null) : (list.icon ?? null);
      const nextIconColor =
        nextIcon === null
          ? null
          : wantsIconColor
            ? (input.iconColor ?? null)
            : (list.iconColor ?? null);
      const iconChanged = wantsIcon && (list.icon ?? null) !== nextIcon;
      const iconColorChanged =
        (wantsIcon || wantsIconColor) && (list.iconColor ?? null) !== nextIconColor;

      const patch: Partial<typeof lists.$inferInsert> = {};
      if (titleChanged) patch.title = input.title;
      if (colorChanged) patch.color = input.color ?? null;
      if (iconChanged) patch.icon = nextIcon;
      if (iconColorChanged) patch.iconColor = nextIconColor;

      if (Object.keys(patch).length === 0) {
        return { ...list, changed: false as const };
      }

      const [updated] = await tx
        .update(lists)
        .set(patch)
        .where(eq(lists.id, input.listId))
        .returning(listCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (titleChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'list.renamed',
          payload: {
            listId: updated.id,
            fromTitle: list.title,
            toTitle: updated.title,
            clientMutationId: ctx.clientMutationId,
          },
        });
      }

      if (colorChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: updated.color ? 'list.color_changed' : 'list.color_cleared',
          payload: updated.color
            ? {
                listId: updated.id,
                oldColor: list.color ?? null,
                newColor: updated.color,
                clientMutationId: ctx.clientMutationId,
              }
            : { listId: updated.id, oldColor: list.color, clientMutationId: ctx.clientMutationId },
        });
      }

      if (iconChanged || iconColorChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: updated.icon ? 'list.icon_changed' : 'list.icon_cleared',
          payload: updated.icon
            ? {
                listId: updated.id,
                oldIcon: list.icon ?? null,
                newIcon: updated.icon,
                oldIconColor: list.iconColor ?? null,
                newIconColor: updated.iconColor ?? null,
                clientMutationId: ctx.clientMutationId,
              }
            : {
                listId: updated.id,
                oldIcon: list.icon,
                oldIconColor: list.iconColor,
                clientMutationId: ctx.clientMutationId,
              },
        });
      }

      const [bumped] = await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ version: boards.version });

      const realtimeData: {
        listId: string;
        fromTitle?: string;
        toTitle?: string;
        color?: string | null;
        icon?: string | null;
        iconColor?: string | null;
      } = { listId: updated.id };
      if (titleChanged) {
        realtimeData.fromTitle = list.title;
        realtimeData.toTitle = updated.title;
      }
      if (colorChanged) {
        realtimeData.color = updated.color ?? null;
      }
      if (iconChanged) {
        realtimeData.icon = updated.icon ?? null;
      }
      if (iconColorChanged || (iconChanged && (updated.icon ?? null) === null)) {
        realtimeData.iconColor = updated.iconColor ?? null;
      }

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'list.updated',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: bumped?.version ?? 0,
        data: realtimeData,
      });

      if (titleChanged) {
        await upsertSearchDocument(tx, { entityType: 'list', entityId: updated.id });
      }

      return { ...updated, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
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

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
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
      assertNotArchived('board', board);

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
        payload: {
          listId: updated.id,
          archived: input.archived,
          clientMutationId: ctx.clientMutationId,
        },
      });

      const [bumped] = await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ version: boards.version });

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'list.archived',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: bumped?.version ?? 0,
        data: { listId: updated.id, archived: input.archived },
      });

      await syncSearchDocumentsForScope(tx, {
        boardId: ctx.board.id,
        entityTypes: ['list', 'card', 'comment'],
      });

      return { id: updated.id, archivedAt: updated.archivedAt, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
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

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      // Advisory lock keyed identically to the compaction job's `compactionScopeKey`
      // (`apps/worker/src/jobs/compaction.ts`) — moves and compaction on the same
      // scope serialize. Scope = board (`ctx.board.id`): list positions are
      // board-scoped, so the lock covers the same key the compaction worker uses.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${compactionScopeKey({ kind: 'board', boardId: ctx.board.id })}))`,
      );

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      assertNotArchived('board', board);

      const [list] = await tx
        .select(listCols)
        .from(lists)
        .where(eq(lists.id, input.listId))
        .limit(1);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
      }
      if (list.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Liste bu board'a ait değil." });
      }

      // A list cannot be positioned relative to itself (degenerate).
      if (input.beforeListId === input.listId || input.afterListId === input.listId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bir liste kendisine göre konumlandırılamaz.',
        });
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
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "Komşu listeler bu board'a ait olmalı.",
        });
      }

      const position = resolveMovePosition(
        input.newPosition,
        before?.position ?? null,
        after?.position ?? null,
      );

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
        payload: {
          listId: updated.id,
          fromPosition: list.position,
          toPosition: updated.position,
          clientMutationId: ctx.clientMutationId,
        },
      });

      const [bumped] = await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ version: boards.version });

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'list.moved',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: bumped?.version ?? 0,
        data: {
          listId: updated.id,
          fromPosition: list.position,
          toPosition: updated.position,
        },
      });

      return { ...updated, changed: true as const };
    });

    // After commit (best-effort, fire-and-forget): if the new fractional key is
    // long enough, queue a background re-balance of this board's lists.
    if (result.changed) {
      maybeEnqueueCompaction(ctx, { kind: 'board', boardId: ctx.board.id }, [result.position]);
    }
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);

    return result;
  }),

  /**
   * Permanently delete a list (Faz 17 — 2026-06-01). **Board admin+ only**
   * (`canManageBoard`). The list must be *empty* — no cards (active or
   * archived). An archived board is read-only. Writes a `list.deleted`
   * activity event and a `list.deleted` realtime event, removes the list's
   * search document, then `db.delete(lists)` — cascade is a no-op since the
   * list has no children. Idempotent on `clientMutationId` at the wire level;
   * a missing list on retry returns the same shape as the first call (id +
   * `changed: false`). Different from `archive`: archive sets `archived_at`
   * and is reversible; `delete` removes the row.
   */
  delete: boardProcedure.input(deleteListInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Listeyi kalıcı silmek için board yöneticisi olmanız gerekir.',
      });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [list] = await tx
        .select({ id: lists.id, boardId: lists.boardId, title: lists.title })
        .from(lists)
        .where(eq(lists.id, input.listId))
        .limit(1);
      if (!list) {
        // Idempotent retry: already gone.
        return { id: input.listId, changed: false as const };
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
      assertNotArchived('board', board);

      // Empty-list gate (active + archived). Cards FK is `ON DELETE CASCADE`
      // (cards.list_id → lists.id), so the gate is purely a UX safety net:
      // delete-by-mistake should not silently take a list of cards with it.
      const [{ count: cardCount } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cards)
        .where(eq(cards.listId, list.id));
      if (cardCount > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Liste kalıcı silinemez: içinde kart var. Önce kartları başka bir listeye taşıyın veya arşivleyin.',
        });
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'list.deleted',
        payload: {
          listId: list.id,
          title: list.title,
          clientMutationId: ctx.clientMutationId,
        },
      });

      const [bumped] = await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ version: boards.version });

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'list.deleted',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: bumped?.version ?? 0,
        data: { listId: list.id },
      });

      await deleteSearchDocument(tx, { entityType: 'list', entityId: list.id });
      await tx.delete(lists).where(eq(lists.id, list.id));

      return { id: list.id, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),
});
