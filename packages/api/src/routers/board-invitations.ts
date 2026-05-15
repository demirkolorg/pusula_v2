/**
 * Board-invitations router — Phase 2.5C (DEM-52). Nested under
 * `board.invitations.*`: `board.invitations.{list,revoke,mine,accept,decline}`.
 * The board-scoped twin of `workspace.invitations.*`. `list`/`revoke` run on
 * `boardProcedure` (input carries `boardId`); `mine`/`accept`/`decline` run on
 * `protectedProcedure` because the caller is not (yet) a board member. The
 * procedure body adds the finer role check with `@pusula/domain/permissions`:
 * - `list`   — board `member+` (`canEditBoardContent`).
 * - `revoke` — board `admin` (`canManageBoard`).
 * - `mine`/`accept`/`decline` — any authenticated user; the invitation `email`
 *   must match the caller's email.
 *
 * Accepting an invitation also lazily makes the caller a workspace `guest` if
 * they aren't a workspace member yet (invariant 12). Each mutation's transaction
 * contains only the domain change + the `activity_events` insert(s) + the
 * `boards.version` bump (Phase 2.5 scope). Tokens are returned by `mine` (the
 * client passes them to `accept`/`decline`) but never echoed by `list`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — board.invitations procedure'leri)
 * and `docs/domain/02-yetkilendirme-kurallari.md` (Board davet akışı).
 */
import { and, asc, eq, gt, sql } from '@pusula/db';
import {
  activityEvents,
  boardInvitations,
  boardMembers,
  boards,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  acceptBoardInvitationInput,
  canEditBoardContent,
  canManageBoard,
  declineBoardInvitationInput,
  listBoardInvitationsInput,
  revokeBoardInvitationInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import {
  bumpBoardVersionForRealtime,
  insertRealtimeEvent,
  maybeEnqueueRealtimePublish,
} from '../lib/realtime-publish';
import { protectedProcedure, router } from '../trpc';

export const boardInvitationsRouter = router({
  /**
   * Pending invitations for this board, oldest first. Board `member+` may view.
   * No transaction (read-only). Tokens are **not** returned.
   */
  list: boardProcedure.input(listBoardInvitationsInput).query(async ({ ctx }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board davetlerini görme yetkiniz yok.' });
    }
    return ctx.db
      .select({
        id: boardInvitations.id,
        email: boardInvitations.email,
        role: boardInvitations.role,
        invitedByName: users.name,
        expiresAt: boardInvitations.expiresAt,
        createdAt: boardInvitations.createdAt,
      })
      .from(boardInvitations)
      .leftJoin(users, eq(boardInvitations.invitedById, users.id))
      .where(
        and(eq(boardInvitations.boardId, ctx.board.id), eq(boardInvitations.status, 'pending')),
      )
      .orderBy(asc(boardInvitations.createdAt));
  }),

  /** Revoke a `pending` board invitation. Board `admin` only. */
  revoke: boardProcedure.input(revokeBoardInvitationInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Davet iptal etme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [invitation] = await tx
        .select({
          id: boardInvitations.id,
          boardId: boardInvitations.boardId,
          email: boardInvitations.email,
          status: boardInvitations.status,
        })
        .from(boardInvitations)
        .where(eq(boardInvitations.id, input.invitationId))
        .limit(1);
      if (!invitation || invitation.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Davet bulunamadı.' });
      }
      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Yalnızca bekleyen davetler iptal edilebilir.',
        });
      }

      await tx
        .update(boardInvitations)
        .set({ status: 'revoked' })
        .where(eq(boardInvitations.id, invitation.id));

      await tx.insert(activityEvents).values({
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        type: 'board.invitation_revoked',
        payload: { invitationId: invitation.id, email: invitation.email },
      });

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.invitation_revoked',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { invitationId: invitation.id, email: invitation.email },
      });

      return { id: invitation.id, status: 'revoked' as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /** Board invitations addressed to the current user's email — `pending` and not yet expired. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.session.user.email.trim().toLowerCase();
    return ctx.db
      .select({
        id: boardInvitations.id,
        boardId: boardInvitations.boardId,
        boardTitle: boards.title,
        workspaceName: workspaces.name,
        role: boardInvitations.role,
        invitedByName: users.name,
        expiresAt: boardInvitations.expiresAt,
        token: boardInvitations.token,
        createdAt: boardInvitations.createdAt,
      })
      .from(boardInvitations)
      .innerJoin(boards, eq(boardInvitations.boardId, boards.id))
      .innerJoin(workspaces, eq(boards.workspaceId, workspaces.id))
      .leftJoin(users, eq(boardInvitations.invitedById, users.id))
      .where(
        and(
          sql`lower(${boardInvitations.email}) = ${email}`,
          eq(boardInvitations.status, 'pending'),
          gt(boardInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(boardInvitations.createdAt));
  }),

  /**
   * Accept a board invitation by token. The caller joins the board with the
   * invited role (idempotent if already a board member); a workspace `guest`
   * membership is created first if they aren't a workspace member yet. Email
   * must match.
   */
  accept: protectedProcedure.input(acceptBoardInvitationInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const userEmail = ctx.session.user.email.trim().toLowerCase();

    // Expiry is handled *before* the transaction so the `expired` status update
    // is durable (it would be rolled back if done inside the tx that then throws).
    const [pre] = await ctx.db
      .select({
        id: boardInvitations.id,
        status: boardInvitations.status,
        expiresAt: boardInvitations.expiresAt,
      })
      .from(boardInvitations)
      .where(eq(boardInvitations.token, input.token))
      .limit(1);
    if (!pre) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Davet bulunamadı.' });
    }
    if (pre.status === 'pending' && pre.expiresAt.getTime() <= Date.now()) {
      await ctx.db
        .update(boardInvitations)
        .set({ status: 'expired' })
        .where(eq(boardInvitations.id, pre.id));
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Davet süresi doldu.' });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      // Lock the invitation row so two concurrent `accept` calls serialize on it.
      const [invitation] = await tx
        .select({
          id: boardInvitations.id,
          boardId: boardInvitations.boardId,
          email: boardInvitations.email,
          role: boardInvitations.role,
          status: boardInvitations.status,
          expiresAt: boardInvitations.expiresAt,
        })
        .from(boardInvitations)
        .where(eq(boardInvitations.token, input.token))
        .for('update')
        .limit(1);
      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Davet bulunamadı.' });
      }
      if (invitation.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Davet artık geçerli değil.' });
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Davet süresi doldu.' });
      }
      if (invitation.email.toLowerCase() !== userEmail) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bu davet başka bir e-postaya gönderildi.',
        });
      }

      const [board] = await tx
        .select({ id: boards.id, workspaceId: boards.workspaceId, archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, invitation.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Arşivli board için davet kabul edilemez.',
        });
      }

      const [workspace] = await tx
        .select({ archivedAt: workspaces.archivedAt })
        .from(workspaces)
        .where(eq(workspaces.id, board.workspaceId))
        .limit(1);
      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }
      if (workspace.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Arşivli workspace için davet kabul edilemez.',
        });
      }

      // Lazily make the caller a workspace `guest` if they aren't a member yet.
      const [wsMember] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, board.workspaceId),
            eq(workspaceMembers.userId, userId),
          ),
        )
        .limit(1);
      if (!wsMember) {
        const insertedWs = await tx
          .insert(workspaceMembers)
          .values({ workspaceId: board.workspaceId, userId, role: 'guest' })
          .onConflictDoNothing()
          .returning({ userId: workspaceMembers.userId });
        if (insertedWs.length > 0) {
          await tx.insert(activityEvents).values({
            workspaceId: board.workspaceId,
            actorId: userId,
            type: 'workspace.member_added',
            payload: { userId, role: 'guest', viaBoardInvitation: invitation.id },
          });
        }
      }

      // Add the board member iff not already present.
      const insertedBoard = await tx
        .insert(boardMembers)
        .values({ boardId: invitation.boardId, userId, role: invitation.role })
        .onConflictDoNothing()
        .returning({ userId: boardMembers.userId });
      if (insertedBoard.length > 0) {
        await tx.insert(activityEvents).values({
          workspaceId: board.workspaceId,
          boardId: invitation.boardId,
          actorId: userId,
          type: 'board.member_added',
          payload: { userId, role: invitation.role, viaInvitation: invitation.id },
        });
      }

      // Always close the invitation — idempotent: re-accepting just re-stamps it.
      await tx
        .update(boardInvitations)
        .set({ status: 'accepted', acceptedById: userId, acceptedAt: new Date() })
        .where(eq(boardInvitations.id, invitation.id));

      const seq = await bumpBoardVersionForRealtime(tx, invitation.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.invitation_accepted',
        workspaceId: board.workspaceId,
        boardId: invitation.boardId,
        actorId: userId,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { invitationId: invitation.id, userId },
      });

      return { boardId: invitation.boardId, role: invitation.role };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /** Decline a board invitation by token. Email must match. No activity is written. */
  decline: protectedProcedure
    .input(declineBoardInvitationInput)
    .mutation(async ({ ctx, input }) => {
      const userEmail = ctx.session.user.email.trim().toLowerCase();

      let realtimeEventId: string | undefined;
      const result = await ctx.db.transaction(async (tx) => {
        const [invitation] = await tx
          .select({
            id: boardInvitations.id,
            boardId: boardInvitations.boardId,
            email: boardInvitations.email,
            status: boardInvitations.status,
          })
          .from(boardInvitations)
          .where(eq(boardInvitations.token, input.token))
          .limit(1);
        if (!invitation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Davet bulunamadı.' });
        }
        if (invitation.email.toLowerCase() !== userEmail) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Bu davet başka bir e-postaya gönderildi.',
          });
        }
        if (invitation.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Davet artık geçerli değil.' });
        }
        const [board] = await tx
          .select({ workspaceId: boards.workspaceId })
          .from(boards)
          .where(eq(boards.id, invitation.boardId))
          .limit(1);
        if (!board) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
        }

        await tx
          .update(boardInvitations)
          .set({ status: 'declined' })
          .where(eq(boardInvitations.id, invitation.id));

        const seq = await bumpBoardVersionForRealtime(tx, invitation.boardId);
        realtimeEventId = await insertRealtimeEvent(tx, {
          type: 'board.invitation_declined',
          workspaceId: board.workspaceId,
          boardId: invitation.boardId,
          actorId: ctx.session.user.id,
          clientMutationId: ctx.clientMutationId,
          seq,
          data: { invitationId: invitation.id },
        });

        return { id: invitation.id, status: 'declined' as const };
      });
      maybeEnqueueRealtimePublish(ctx, realtimeEventId);
      return result;
    }),
});
