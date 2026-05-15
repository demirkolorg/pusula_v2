/**
 * Board access request router (DEM-102).
 *
 * This is intentionally separate from `board.invitations.*`: invitations are
 * admin-initiated and token-based; access requests are requester-initiated from
 * a board link. Approval mirrors the board invitation accept path by lazily
 * provisioning workspace `guest` membership when the requester is not in the
 * workspace, then adding the selected board role in the same transaction.
 */
import { and, asc, eq, sql } from '@pusula/db';
import {
  activityEvents,
  boardAccessRequests,
  boardMembers,
  boards,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  approveBoardAccessRequestInput,
  boardAccessContextInput,
  canManageBoard,
  effectiveBoardRole,
  rejectBoardAccessRequestInput,
  requestBoardAccessInput,
} from '@pusula/domain';
import type { BoardRole, WorkspaceRole } from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import type { Queryable } from '../middleware/board-access';
import { protectedProcedure, router } from '../trpc';

type PendingRequest = {
  id: string;
  boardId: string;
  requesterId: string;
  status: string;
  message: string | null;
  createdAt: Date;
};

async function loadBoardRequestContext(db: Queryable, boardId: string, userId: string) {
  const [target] = await db
    .select({
      boardId: boards.id,
      boardTitle: boards.title,
      boardArchivedAt: boards.archivedAt,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(boards)
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!target) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [workspaceMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, target.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  const [boardMembership] = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, target.boardId), eq(boardMembers.userId, userId)))
    .limit(1);
  const [pendingRequest] = await db
    .select({
      id: boardAccessRequests.id,
      boardId: boardAccessRequests.boardId,
      requesterId: boardAccessRequests.requesterId,
      status: boardAccessRequests.status,
      message: boardAccessRequests.message,
      createdAt: boardAccessRequests.createdAt,
    })
    .from(boardAccessRequests)
    .where(
      and(
        eq(boardAccessRequests.boardId, target.boardId),
        eq(boardAccessRequests.requesterId, userId),
        eq(boardAccessRequests.status, 'pending'),
      ),
    )
    .limit(1);

  const role =
    workspaceMembership == null
      ? null
      : effectiveBoardRole({
          workspaceRole: workspaceMembership.role as WorkspaceRole,
          boardRole: (boardMembership?.role ?? null) as BoardRole | null,
        });

  return {
    target,
    user,
    workspaceMembership,
    boardMembership,
    role,
    pendingRequest: pendingRequest as PendingRequest | undefined,
  };
}

export const boardAccessRequestsRouter = router({
  /**
   * Safe preflight for the board route. This intentionally does not use
   * `boardProcedure`: callers without access still need enough context to know
   * what they are requesting. It returns only board/workspace names plus the
   * caller's own account; no lists, cards, members, or admin identities.
   */
  context: protectedProcedure.input(boardAccessContextInput).query(async ({ ctx, input }) => {
    const resolved = await loadBoardRequestContext(ctx.db, input.boardId, ctx.session.user.id);
    const account = resolved.user ?? {
      id: ctx.session.user.id,
      name: ctx.session.user.name ?? null,
      email: ctx.session.user.email,
      image: ctx.session.user.image ?? null,
    };

    return {
      board: {
        id: resolved.target.boardId,
        title: resolved.target.boardTitle,
        archivedAt: resolved.target.boardArchivedAt,
      },
      workspace: { id: resolved.target.workspaceId, name: resolved.target.workspaceName },
      currentUser: account,
      access: { hasAccess: resolved.role != null, role: resolved.role },
      request: resolved.pendingRequest
        ? { id: resolved.pendingRequest.id, status: 'pending' as const }
        : { id: null, status: 'none' as const },
    };
  }),

  /**
   * Create a pending request for this board. Repeated requests by the same user
   * while one is pending return the existing row.
   */
  request: protectedProcedure.input(requestBoardAccessInput).mutation(async ({ ctx, input }) => {
    return ctx.db.transaction(async (tx) => {
      const resolved = await loadBoardRequestContext(tx, input.boardId, ctx.session.user.id);
      if (resolved.role) {
        return {
          id: null,
          boardId: resolved.target.boardId,
          requesterId: ctx.session.user.id,
          status: 'already_member' as const,
          message: null,
          createdAt: null,
        };
      }
      if (resolved.target.boardArchivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Arşivli board için erişim talebi oluşturulamaz.',
        });
      }
      if (resolved.pendingRequest) return resolved.pendingRequest;

      const [created] = await tx
        .insert(boardAccessRequests)
        .values({
          boardId: resolved.target.boardId,
          requesterId: ctx.session.user.id,
          status: 'pending',
          message: input.message && input.message.length > 0 ? input.message : null,
        })
        .onConflictDoNothing()
        .returning({
          id: boardAccessRequests.id,
          boardId: boardAccessRequests.boardId,
          requesterId: boardAccessRequests.requesterId,
          status: boardAccessRequests.status,
          message: boardAccessRequests.message,
          createdAt: boardAccessRequests.createdAt,
        });
      if (created) return created;

      const [pending] = await tx
        .select({
          id: boardAccessRequests.id,
          boardId: boardAccessRequests.boardId,
          requesterId: boardAccessRequests.requesterId,
          status: boardAccessRequests.status,
          message: boardAccessRequests.message,
          createdAt: boardAccessRequests.createdAt,
        })
        .from(boardAccessRequests)
        .where(
          and(
            eq(boardAccessRequests.boardId, resolved.target.boardId),
            eq(boardAccessRequests.requesterId, ctx.session.user.id),
            eq(boardAccessRequests.status, 'pending'),
          ),
        )
        .limit(1);
      if (!pending) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return pending;
    });
  }),

  /** Board admins can see pending requests. */
  list: boardProcedure.query(async ({ ctx }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Erişim taleplerini görme yetkiniz yok.' });
    }

    return ctx.db
      .select({
        id: boardAccessRequests.id,
        boardId: boardAccessRequests.boardId,
        requesterId: boardAccessRequests.requesterId,
        requesterName: users.name,
        requesterEmail: users.email,
        message: boardAccessRequests.message,
        status: boardAccessRequests.status,
        createdAt: boardAccessRequests.createdAt,
      })
      .from(boardAccessRequests)
      .innerJoin(users, eq(users.id, boardAccessRequests.requesterId))
      .where(
        and(
          eq(boardAccessRequests.boardId, ctx.board.id),
          eq(boardAccessRequests.status, 'pending'),
        ),
      )
      .orderBy(asc(boardAccessRequests.createdAt));
  }),

  /**
   * Approve a pending request. The admin chooses only the board role; workspace
   * provisioning is derived and atomic.
   */
  approve: boardProcedure.input(approveBoardAccessRequestInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Erişim talebi onaylama yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(boardAccessRequests)
        .where(eq(boardAccessRequests.id, input.requestId))
        .limit(1)
        .for('update');
      if (!request || request.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Erişim talebi bulunamadı.' });
      }
      if (request.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Yalnızca bekleyen talepler onaylanabilir.',
        });
      }

      const [board] = await tx
        .select({
          id: boards.id,
          workspaceId: boards.workspaceId,
          archivedAt: boards.archivedAt,
        })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      if (board.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Arşivli board için erişim talebi onaylanamaz.',
        });
      }

      const [workspaceMembership] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, board.workspaceId),
            eq(workspaceMembers.userId, request.requesterId),
          ),
        )
        .limit(1);

      let workspaceRoleCreated = false;
      if (!workspaceMembership) {
        const inserted = await tx
          .insert(workspaceMembers)
          .values({ workspaceId: board.workspaceId, userId: request.requesterId, role: 'guest' })
          .onConflictDoNothing()
          .returning({ userId: workspaceMembers.userId });
        workspaceRoleCreated = inserted.length > 0;
        if (workspaceRoleCreated) {
          await tx.insert(activityEvents).values({
            workspaceId: board.workspaceId,
            actorId: ctx.session.user.id,
            type: 'workspace.member_added',
            payload: {
              userId: request.requesterId,
              role: 'guest',
              viaBoardId: board.id,
              viaBoardAccessRequest: request.id,
              clientMutationId: ctx.clientMutationId,
            },
          });
        }
      }

      const [existingBoardMember] = await tx
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(
          and(eq(boardMembers.boardId, board.id), eq(boardMembers.userId, request.requesterId)),
        )
        .limit(1);

      let boardRoleCreated = false;
      if (!existingBoardMember) {
        const inserted = await tx
          .insert(boardMembers)
          .values({ boardId: board.id, userId: request.requesterId, role: input.role })
          .onConflictDoNothing()
          .returning({ userId: boardMembers.userId });
        boardRoleCreated = inserted.length > 0;
        if (boardRoleCreated) {
          await tx.insert(activityEvents).values({
            workspaceId: board.workspaceId,
            boardId: board.id,
            actorId: ctx.session.user.id,
            type: 'board.member_added',
            payload: {
              userId: request.requesterId,
              role: input.role,
              viaBoardAccessRequest: request.id,
              clientMutationId: ctx.clientMutationId,
            },
          });
          await tx
            .update(boards)
            .set({ version: sql`${boards.version} + 1` })
            .where(eq(boards.id, board.id));
        }
      }

      const now = new Date();
      const [updated] = await tx
        .update(boardAccessRequests)
        .set({ status: 'approved', resolvedById: ctx.session.user.id, resolvedAt: now })
        .where(eq(boardAccessRequests.id, request.id))
        .returning({
          id: boardAccessRequests.id,
          boardId: boardAccessRequests.boardId,
          requesterId: boardAccessRequests.requesterId,
          status: boardAccessRequests.status,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      return {
        ...updated,
        role: existingBoardMember?.role ?? input.role,
        workspaceRoleCreated,
        boardRoleCreated,
      };
    });
  }),

  /** Board admins can reject a pending request. */
  reject: boardProcedure.input(rejectBoardAccessRequestInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Erişim talebi reddetme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(boardAccessRequests)
        .where(eq(boardAccessRequests.id, input.requestId))
        .limit(1)
        .for('update');
      if (!request || request.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Erişim talebi bulunamadı.' });
      }
      if (request.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Yalnızca bekleyen talepler reddedilebilir.',
        });
      }

      const [updated] = await tx
        .update(boardAccessRequests)
        .set({ status: 'rejected', resolvedById: ctx.session.user.id, resolvedAt: new Date() })
        .where(eq(boardAccessRequests.id, request.id))
        .returning({
          id: boardAccessRequests.id,
          boardId: boardAccessRequests.boardId,
          requesterId: boardAccessRequests.requesterId,
          status: boardAccessRequests.status,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return updated;
    });
  }),
});
