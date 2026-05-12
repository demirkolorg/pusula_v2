/**
 * Board router — Phase 2A (DEM-34): board CRUD only. `list.*` / `card.*` land in
 * DEM-35 / DEM-36; `move`/reorder + drag-drop in Phase 3; optimistic UI in
 * Phase 4; realtime publishing in Phase 5; notification outbox in Phase 6.
 *
 * Authorization is server-side: `workspaceProcedure` / `boardProcedure` resolve
 * the caller's membership; the procedure body checks the finer role with
 * `@pusula/domain/permissions`. Each mutation's transaction contains only the
 * domain change + the `activity_events` insert (Phase 2 scope). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası) and `docs/architecture/03-backend.md`.
 */
import { and, asc, eq, isNull, sql } from '@pusula/db';
import { activityEvents, boardMembers, boards, cards, lists } from '@pusula/db';
import {
  archiveBoardInput,
  canManageBoard,
  canViewBoard,
  createBoardInput,
  effectiveBoardRole,
  updateBoardInput,
  type BoardRole,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { boardProcedure } from '../middleware/board';
import { workspaceProcedure } from '../middleware/workspace';
import { router } from '../trpc';

/** Build an `AccessContext` from a resolved (already-effective) board role. */
const accessFromBoardRole = (boardRole: BoardRole) => ({ workspaceRole: null, boardRole });

/** Columns of a full board row returned to clients (sans internal-only fields — there are none yet). */
const boardCols = {
  id: boards.id,
  workspaceId: boards.workspaceId,
  title: boards.title,
  version: boards.version,
  archivedAt: boards.archivedAt,
  createdAt: boards.createdAt,
  updatedAt: boards.updatedAt,
} as const;

export const boardRouter = router({
  /**
   * Boards in the workspace, with the caller's effective role on each.
   * A workspace `guest` sees only boards they're an explicit `board_members`
   * row of; `member+` sees every board (with an inherited or explicit role).
   * Archived boards are returned too (read-only, but still visible).
   */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const listCols = {
      id: boards.id,
      title: boards.title,
      version: boards.version,
      archivedAt: boards.archivedAt,
      createdAt: boards.createdAt,
      boardRole: boardMembers.role,
    } as const;
    const rows =
      ctx.workspace.role === 'guest'
        ? await ctx.db
            .select(listCols)
            .from(boards)
            .innerJoin(
              boardMembers,
              and(
                eq(boardMembers.boardId, boards.id),
                eq(boardMembers.userId, ctx.session.user.id),
              ),
            )
            .where(eq(boards.workspaceId, ctx.workspace.id))
            .orderBy(asc(boards.createdAt))
        : await ctx.db
            .select(listCols)
            .from(boards)
            .leftJoin(
              boardMembers,
              and(
                eq(boardMembers.boardId, boards.id),
                eq(boardMembers.userId, ctx.session.user.id),
              ),
            )
            .where(eq(boards.workspaceId, ctx.workspace.id))
            .orderBy(asc(boards.createdAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      version: row.version,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      // For a guest these rows come from an inner join, so `boardRole` is always
      // non-null and `effectiveBoardRole` returns it verbatim; for member+ it may
      // be null and is inherited from the workspace role.
      role: effectiveBoardRole({
        workspaceRole: ctx.workspace.role,
        boardRole: row.boardRole ?? null,
      }) as BoardRole,
    }));
  }),

  /**
   * Create a board in the workspace. Workspace `member+` only (a `guest` cannot
   * create boards). The creator becomes a board `admin` member. Writes a
   * `board.created` activity event in the same transaction.
   */
  create: workspaceProcedure.input(createBoardInput).mutation(async ({ ctx, input }) => {
    if (ctx.workspace.role === 'guest') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board oluşturma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .insert(boards)
        .values({ workspaceId: ctx.workspace.id, title: input.title })
        .returning(boardCols);
      if (!board) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .insert(boardMembers)
        .values({ boardId: board.id, userId: ctx.session.user.id, role: 'admin' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        boardId: board.id,
        actorId: ctx.session.user.id,
        type: 'board.created',
        payload: { title: board.title },
      });

      return { ...board, role: 'admin' satisfies BoardRole };
    });
  }),

  /**
   * Board shell + its lists + active cards, for the board screen (Phase 2D will
   * consume this shape). `boardProcedure` already guarantees `viewer+`. Lists
   * include archived ones (read-only, still rendered); cards are active only
   * (`archived_at IS NULL`). Cards are fetched in one query keyed by `boardId`
   * and grouped client-side. Both lists and cards are returned in `position`
   * order.
   */
  get: boardProcedure.query(async ({ ctx }) => {
    if (!canViewBoard(accessFromBoardRole(ctx.board.role))) {
      // Unreachable in practice — `boardProcedure` already enforces viewer+ — but
      // makes the authorization explicit.
      throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
    }

    const [board] = await ctx.db.select(boardCols).from(boards).where(eq(boards.id, ctx.board.id)).limit(1);
    if (!board) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
    }

    const boardLists = await ctx.db
      .select({
        id: lists.id,
        title: lists.title,
        position: lists.position,
        archivedAt: lists.archivedAt,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .where(eq(lists.boardId, ctx.board.id))
      .orderBy(asc(lists.position));

    const boardCards = await ctx.db
      .select({
        id: cards.id,
        listId: cards.listId,
        boardId: cards.boardId,
        title: cards.title,
        description: cards.description,
        position: cards.position,
        dueAt: cards.dueAt,
        archivedAt: cards.archivedAt,
        createdAt: cards.createdAt,
        updatedAt: cards.updatedAt,
      })
      .from(cards)
      .where(and(eq(cards.boardId, ctx.board.id), isNull(cards.archivedAt)))
      .orderBy(asc(cards.position));

    return {
      board: { ...board, role: ctx.board.role },
      lists: boardLists,
      cards: boardCards,
    };
  }),

  /**
   * Update a board's title. Board `admin` only. An archived board is read-only.
   * Idempotent: if the title is unchanged, returns `{ ..., changed: false }`
   * without bumping `version` or writing activity.
   */
  update: boardProcedure.input(updateBoardInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board ayarlarını değiştirme yetkiniz yok.' });
    }
    if (input.title === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [current] = await tx.select(boardCols).from(boards).where(eq(boards.id, ctx.board.id)).limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (current.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }
      if (current.title === input.title) {
        return { ...current, role: ctx.board.role, changed: false as const };
      }

      const [updated] = await tx
        .update(boards)
        .set({ title: input.title, version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning(boardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'board.renamed',
        payload: { fromTitle: current.title, toTitle: input.title },
      });

      return { ...updated, role: ctx.board.role, changed: true as const };
    });
  }),

  /**
   * Archive (or restore) a board. Board `admin` only. `archived: true` sets
   * `archived_at = now()`; `false` clears it. Idempotent: a no-op flip returns
   * `{ id, archivedAt, changed: false }` without writing activity. An archived
   * board is read-only for everything else (see `update`, and later list/card
   * procedures). Bumps `version` on a real change.
   */
  archive: boardProcedure.input(archiveBoardInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yalnızca board admini arşivleyebilir.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ archivedAt: boards.archivedAt, version: boards.version })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }

      const isArchived = current.archivedAt !== null;
      if (isArchived === input.archived) {
        return {
          id: ctx.board.id,
          archivedAt: current.archivedAt,
          version: current.version,
          changed: false as const,
        };
      }

      const nextArchivedAt = input.archived ? new Date() : null;
      const [updated] = await tx
        .update(boards)
        .set({ archivedAt: nextArchivedAt, version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ id: boards.id, archivedAt: boards.archivedAt, version: boards.version });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'board.archived',
        payload: { archived: input.archived },
      });

      return {
        id: updated.id,
        archivedAt: updated.archivedAt,
        version: updated.version,
        changed: true as const,
      };
    });
  }),
});
