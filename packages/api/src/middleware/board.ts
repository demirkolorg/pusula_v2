/**
 * `boardProcedure` — `protectedProcedure` + a middleware that resolves the
 * `boardId` from the procedure input, loads the board row, and resolves the
 * caller's *effective* board role from their workspace + board memberships
 * (delegated to `resolveBoardAccess`).
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
import { idSchema } from '@pusula/domain';
import type { BoardRole } from '@pusula/domain';
import { protectedProcedure } from '../trpc';
import { resolveBoardAccess } from './board-access';

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
 * Build an `AccessContext` from a resolved (already-effective) board role.
 * Shared by the board / list / card routers so they don't each re-derive it.
 */
export const accessFromBoardRole = (boardRole: BoardRole) => ({
  workspaceRole: null,
  boardRole,
});

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

    const access = await resolveBoardAccess(ctx.db, parsed.data.boardId, ctx.session.user.id);

    return next({
      ctx: {
        ...ctx,
        board: {
          id: access.id,
          workspaceId: access.workspaceId,
          role: access.role,
        } satisfies BoardContext,
      },
    });
  });
