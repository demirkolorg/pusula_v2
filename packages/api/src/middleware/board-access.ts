/**
 * Shared board-access resolution: load a board row, resolve the caller's
 * *effective* board role (explicit `board_members` row, else inherited from the
 * workspace role), and enforce the visibility gates. Reused by `boardProcedure`
 * (board-scoped procedures) and `cardProcedure` (card-scoped procedures) so the
 * "can the caller see this board?" rule lives in exactly one place.
 *
 * - Board not found → `NOT_FOUND` ("Board bulunamadı.").
 * - Caller is not a member of the board's workspace → `FORBIDDEN`.
 * - Caller has no effective board role (workspace `guest` without an explicit
 *   `board_members` row) → `FORBIDDEN`.
 *
 * Fine-grained authorization (`canEditBoardContent`, `canManageBoard`, …) is
 * still done in the procedure body with `@pusula/domain/permissions`; archived
 * board read-only enforcement happens in the procedure body too (it re-reads the
 * row inside its transaction anyway). The resolved `archivedAt` is carried here
 * for callers that need it before opening a transaction (e.g. `card.create`).
 *
 * Accepts any Drizzle handle (`Database` or a transaction), so it can run inside
 * a transaction when the caller wants a race-safe read.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from '@pusula/db';
import { boardMembers, boards, workspaceMembers } from '@pusula/db';
import type { Database } from '@pusula/db';
import { effectiveBoardRole } from '@pusula/domain';
import type { BoardRole } from '@pusula/domain';

/** A Drizzle transaction handle for our schema, as passed to `db.transaction(cb)`. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Either the shared `Database` handle or a transaction handle — both expose `.select()`. */
export type Queryable = Database | Transaction;

/** The resolved board context. `archivedAt` is the board row's value at resolution time. */
export interface BoardAccess {
  id: string;
  workspaceId: string;
  /** Effective board role (explicit membership, or inherited from the workspace role). */
  role: BoardRole;
  /** `null` when the board is active; the archive timestamp otherwise. */
  archivedAt: Date | null;
}

/**
 * Resolve the caller's access to a board, enforcing the visibility gates.
 * Throws `TRPCError` on failure; returns `{ id, workspaceId, role, archivedAt }`.
 */
export async function resolveBoardAccess(
  db: Queryable,
  boardId: string,
  userId: string,
): Promise<BoardAccess> {
  const [board] = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      archivedAt: boards.archivedAt,
    })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!board) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
  }

  const [workspaceMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, board.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  if (!workspaceMembership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
  }

  const [boardMembership] = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, board.id), eq(boardMembers.userId, userId)))
    .limit(1);

  const role = effectiveBoardRole({
    workspaceRole: workspaceMembership.role,
    boardRole: boardMembership?.role ?? null,
  });
  if (!role) {
    throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
  }

  return { id: board.id, workspaceId: board.workspaceId, role, archivedAt: board.archivedAt };
}
