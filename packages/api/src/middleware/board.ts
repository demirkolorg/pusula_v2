/**
 * `boardProcedure` — `protectedProcedure` + a middleware that resolves the
 * `boardId` from the procedure input, loads the board row, and resolves the
 * caller's *effective* board role from their workspace + board memberships.
 *
 * This is the *enforcement* point only ("can the caller see this board?");
 * fine-grained authorization (`canEditBoardContent`, `canManageBoard`, …) is
 * done in the procedure body with `@pusula/domain/permissions`. See
 * `docs/architecture/03-backend.md` and `docs/domain/02-yetkilendirme-kurallari.md`.
 *
 * - Board not found → `NOT_FOUND`.
 * - Caller is not a member of the board's workspace → `FORBIDDEN`.
 * - Caller has no effective board role (workspace `guest` with no explicit
 *   `board_members` row) → `FORBIDDEN`.
 * - Otherwise `ctx.board = { id, workspaceId, role }` is added; `role` is the
 *   `effectiveBoardRole` (`BoardRole`). The board row's `archivedAt` is *not*
 *   carried here — read-only-when-archived is enforced in the procedure body
 *   (which re-reads the row inside its transaction anyway).
 *
 * The procedure pre-declares `{ boardId: string }` as input; consumers may
 * `.input(...)` additional fields. The middleware reads only `boardId` from the
 * raw input.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { and, eq } from '@pusula/db';
import { boardMembers, boards, workspaceMembers } from '@pusula/db';
import { effectiveBoardRole, idSchema } from '@pusula/domain';
import type { BoardRole } from '@pusula/domain';
import { protectedProcedure } from '../trpc';

/** Minimal shape the board middleware needs from the procedure input. */
const boardIdInput = z.object({ boardId: idSchema });

/** The board context attached by `boardProcedure`. */
export interface BoardContext {
  id: string;
  workspaceId: string;
  /** Effective board role (explicit membership, or inherited from the workspace role). */
  role: BoardRole;
}

/**
 * Procedure for any operation scoped to a board the caller can view.
 * Input always includes `boardId: string`.
 */
export const boardProcedure = protectedProcedure
  .input(boardIdInput)
  .use(async ({ ctx, next, getRawInput }) => {
    const parsed = boardIdInput.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'boardId gerekli.' });
    }
    const { boardId } = parsed.data;

    const [board] = await ctx.db
      .select({ id: boards.id, workspaceId: boards.workspaceId })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);
    if (!board) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
    }

    const [workspaceMembership] = await ctx.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, board.workspaceId),
          eq(workspaceMembers.userId, ctx.session.user.id),
        ),
      )
      .limit(1);
    if (!workspaceMembership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
    }

    const [boardMembership] = await ctx.db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.boardId, board.id), eq(boardMembers.userId, ctx.session.user.id)),
      )
      .limit(1);

    const role = effectiveBoardRole({
      workspaceRole: workspaceMembership.role,
      boardRole: boardMembership?.role ?? null,
    });
    if (!role) {
      throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
    }

    return next({
      ctx: {
        ...ctx,
        board: { id: board.id, workspaceId: board.workspaceId, role } satisfies BoardContext,
      },
    });
  });
