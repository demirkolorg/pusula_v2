import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, gt, inArray, isNull, max, sql } from '@pusula/db';
import {
  activityEvents,
  boards,
  cardMembers,
  cards,
  notificationOutbox,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  acceptWorkspaceInvitationInput,
  archiveWorkspaceInput,
  canManageWorkspace,
  createWorkspaceInput,
  declineWorkspaceInvitationInput,
  deleteWorkspaceInput,
  inviteWorkspaceMemberInput,
  removeWorkspaceMemberInput,
  revokeWorkspaceInvitationInput,
  WORKSPACE_INVITATION_TTL_DAYS,
  updateWorkspaceInput,
  updateWorkspaceMemberRoleInput,
  type WorkspaceRole,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { appendAudit } from '../lib/audit-log';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import { INVITATION_MESSAGES } from '../lib/permission-strings';
import { workspaceProcedure } from '../middleware/workspace';
import { protectedProcedure, router } from '../trpc';

/**
 * Workspace router — create / read / update / archive, member management, and
 * the token-based invitation flow (Phase 1.3). All authorization is server-side:
 * `workspaceProcedure` checks membership; the procedure body checks the finer
 * role with `@pusula/domain/permissions`. `accept`/`decline`/`mine` run on
 * `protectedProcedure` because the caller is not (yet) a member. Notification
 * delivery is deferred to the worker (Phase 6) — procedures only write
 * `notification_outbox` rows. Realtime publishing lands in a later phase. See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Workspace davet akışı).
 */

/** Build an `AccessContext` from a resolved workspace role (no board context here). */
const accessFromWorkspaceRole = (workspaceRole: WorkspaceRole) => ({
  workspaceRole,
  boardRole: null,
});

/** Cryptographically-random, URL-safe invitation token (~32 chars from 24 bytes). */
const newInvitationToken = () => randomBytes(24).toString('base64url');

const workspaceMembersRouter = router({
  /** Members of the workspace, with their user profile. */
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        userId: workspaceMembers.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, ctx.workspace.id))
      .orderBy(workspaceMembers.createdAt),
  ),

  /** Change a member's workspace role. `owner` cannot be assigned or changed here. */
  updateRole: workspaceProcedure
    .input(updateWorkspaceMemberRoleInput)
    .mutation(async ({ ctx, input }) => {
      if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye rolünü değiştirme yetkiniz yok.' });
      }

      let notificationEventId: string | undefined;
      const result = await ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspace.id),
              eq(workspaceMembers.userId, input.userId),
            ),
          )
          .limit(1);
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Üye bulunamadı.' });
        }
        if (target.role === 'owner') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Owner rolü değiştirilemez; önce devredilmeli.',
          });
        }
        if (target.role === input.role) {
          return { userId: input.userId, role: input.role, changed: false as const };
        }

        await tx
          .update(workspaceMembers)
          .set({ role: input.role })
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspace.id),
              eq(workspaceMembers.userId, input.userId),
            ),
          );

        const roleChangePayload = {
          // Faz 10A (DEM-135): alıcı `targetUserId` (rule engine bunu okur);
          // `userId` legacy alanını da koruyoruz (activity feed sözleşmesi).
          userId: input.userId,
          targetUserId: input.userId,
          fromRole: target.role,
          toRole: input.role,
        };
        const [roleActivity] = await tx
          .insert(activityEvents)
          .values({
            workspaceId: ctx.workspace.id,
            actorId: ctx.session.user.id,
            type: 'workspace.member_role_changed',
            payload: roleChangePayload,
          })
          .returning({ id: activityEvents.id });
        if (!roleActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Faz 10A (DEM-135) — rolü değişen kişiye in-app
        // `member_role_changed` bildirimi (workspace scope; boardId yok).
        // Alıcı hâlâ workspace üyesi olduğu için permission filter geçer.
        const dispatched = await dispatchNotificationsForActivity(tx, {
          id: roleActivity.id,
          type: 'workspace.member_role_changed',
          workspaceId: ctx.workspace.id,
          boardId: null,
          cardId: null,
          actorId: ctx.session.user.id,
          payload: roleChangePayload,
        });
        if (dispatched.inserted > 0) notificationEventId = roleActivity.id;

        // Faz 8E (DEM-282) — kritik permission değişimi forensic audit hattına yazılır.
        await appendAudit(tx, {
          workspaceId: ctx.workspace.id,
          action: 'workspace.member.role_change',
          targetType: 'user',
          targetId: input.userId,
          actorId: ctx.session.user.id,
          before: { role: target.role },
          after: { role: input.role },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return { userId: input.userId, role: input.role, changed: true as const };
      });
      maybeEnqueueNotificationPublish(ctx, notificationEventId);
      return result;
    }),

  /** Remove a member. Managers may remove anyone (except an `owner`); anyone may remove themselves. */
  remove: workspaceProcedure.input(removeWorkspaceMemberInput).mutation(async ({ ctx, input }) => {
    const isSelf = input.userId === ctx.session.user.id;
    if (!isSelf && !canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye çıkarma yetkiniz yok.' });
    }

    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspace.id),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Üye bulunamadı.' });
      }
      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Owner çıkarılamaz; önce sahipliği devredin.',
        });
      }

      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspace.id),
            eq(workspaceMembers.userId, input.userId),
          ),
        );

      const removedPayload = {
        // Faz 10A (DEM-135): alıcı `removedUserId` (rule engine bunu okur);
        // `userId` legacy alanını da koruyoruz (activity feed sözleşmesi).
        userId: input.userId,
        removedUserId: input.userId,
        removedRole: target.role,
        self: isSelf,
      };
      const [removedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.workspace.id,
          actorId: ctx.session.user.id,
          type: 'workspace.member_removed',
          payload: removedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!removedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Faz 10A (DEM-135) — çıkarılan kullanıcıya in-app + email
      // `member_removed` bildirimi (workspace scope; boardId yok).
      // Permission filter atlar: alıcı artık workspace_members'ta yok ama
      // bildirim gitmeli. Aktör (kendisini çıkaran) self-skip alır.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: removedActivity.id,
        type: 'workspace.member_removed',
        workspaceId: ctx.workspace.id,
        boardId: null,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: removedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = removedActivity.id;

      // Faz 8E (DEM-282) — üye çıkarma forensic audit'e yazılır (self-leave dahil).
      await appendAudit(tx, {
        workspaceId: ctx.workspace.id,
        action: 'workspace.member.remove',
        targetType: 'user',
        targetId: input.userId,
        actorId: ctx.session.user.id,
        before: { role: target.role },
        after: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return { userId: input.userId, removed: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Invite an email address to the workspace. Requires `admin+`. Creates a
   * `pending` `workspace_invitations` row (secret token), a `workspace.member_invited`
   * activity event, and `notification_outbox` rows — all in one transaction.
   * The token is never returned in the response; it travels only in the email
   * (`notification_outbox.payload`). Delivery is the worker's job (Phase 6).
   */
  invite: workspaceProcedure.input(inviteWorkspaceMemberInput).mutation(async ({ ctx, input }) => {
    if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye davet etme yetkiniz yok.' });
    }
    const email = input.email.toLowerCase();
    // DEM-298 — caller cannot invite themselves (UI prevents it too; this is
    // the server-side defense-in-depth). Match against the session e-mail in
    // its normalized form so case differences don't slip through.
    if (ctx.session.user.email.trim().toLowerCase() === email) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kendinizi davet edemezsiniz.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [workspace] = await tx
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .limit(1);
      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        const [alreadyMember] = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspace.id),
              eq(workspaceMembers.userId, existingUser.id),
            ),
          )
          .limit(1);
        if (alreadyMember) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Bu kullanıcı zaten workspace üyesi.' });
        }
      }

      const [pendingInvite] = await tx
        .select({ id: workspaceInvitations.id })
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.workspaceId, ctx.workspace.id),
            eq(workspaceInvitations.email, email),
            eq(workspaceInvitations.status, 'pending'),
          ),
        )
        .limit(1);
      if (pendingInvite) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Bu e-posta için zaten bekleyen bir davet var.',
        });
      }

      const token = newInvitationToken();
      const expiresAt = new Date(Date.now() + WORKSPACE_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

      // The pre-check above is a fast/friendly path; the partial unique index
      // `workspace_invitations_pending_email_uq` is the race-proof guarantee —
      // translate its 23505 into a CONFLICT.
      const [invitation] = await withConflict(
        () =>
          tx
            .insert(workspaceInvitations)
            .values({
              workspaceId: ctx.workspace.id,
              email,
              role: input.role,
              token,
              invitedById: ctx.session.user.id,
              status: 'pending',
              expiresAt,
            })
            .returning({ id: workspaceInvitations.id }),
        'Bu e-posta için zaten bekleyen bir davet var.',
      );
      if (!invitation) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.workspace.id,
          actorId: ctx.session.user.id,
          type: 'workspace.member_invited',
          // Faz 6 review fix (W2 DEM-91): activity payload'unda `inviteToken`
          // YOK — in-app notification'a sızmasın. Token sadece direct email
          // outbox satırı (aşağıda) taşır.
          payload: { invitationId: invitation.id, email, role: input.role },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Email channel — recipient may have no account yet (recipientId = null);
      // the worker reads the target address from payload.email.
      await tx.insert(notificationOutbox).values({
        channel: 'email',
        eventId: activity.id,
        recipientId: existingUser?.id ?? null,
        type: 'workspace_invitation',
        payload: {
          workspaceId: ctx.workspace.id,
          workspaceName: workspace.name,
          email,
          role: input.role,
          inviteToken: token,
          invitedById: ctx.session.user.id,
          // DEM-173 — davet e-postasında davet eden kişiyi göster.
          actorName: ctx.session.user.name,
        },
      });

      // In-app channel only if the invitee already has an account.
      if (existingUser) {
        await tx.insert(notificationOutbox).values({
          channel: 'in_app',
          eventId: activity.id,
          recipientId: existingUser.id,
          type: 'workspace_invitation',
          payload: {
            workspaceId: ctx.workspace.id,
            workspaceName: workspace.name,
            role: input.role,
            invitationId: invitation.id,
          },
        });
      }

      return {
        invitationId: invitation.id,
        email,
        role: input.role,
        status: 'pending' as const,
        expiresAt,
      };
    });
  }),
});

const workspaceInvitationsRouter = router({
  /** Pending invitations for this workspace, oldest first. (member+ may view.) */
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        invitedById: workspaceInvitations.invitedById,
        invitedByName: users.name,
        expiresAt: workspaceInvitations.expiresAt,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .leftJoin(users, eq(workspaceInvitations.invitedById, users.id))
      .where(
        and(
          eq(workspaceInvitations.workspaceId, ctx.workspace.id),
          eq(workspaceInvitations.status, 'pending'),
        ),
      )
      .orderBy(asc(workspaceInvitations.createdAt)),
  ),

  /** Revoke a `pending` invitation. Requires `admin+`. */
  revoke: workspaceProcedure
    .input(revokeWorkspaceInvitationInput)
    .mutation(async ({ ctx, input }) => {
      if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Davet iptal etme yetkiniz yok.' });
      }

      return ctx.db.transaction(async (tx) => {
        const [invitation] = await tx
          .select({
            id: workspaceInvitations.id,
            email: workspaceInvitations.email,
            status: workspaceInvitations.status,
          })
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.id, input.invitationId),
              eq(workspaceInvitations.workspaceId, ctx.workspace.id),
            ),
          )
          .limit(1);
        if (!invitation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: INVITATION_MESSAGES.notFound });
        }
        if (invitation.status !== 'pending') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Yalnızca bekleyen davetler iptal edilebilir.',
          });
        }

        await tx
          .update(workspaceInvitations)
          .set({ status: 'revoked' })
          .where(eq(workspaceInvitations.id, invitation.id));

        await tx.insert(activityEvents).values({
          workspaceId: ctx.workspace.id,
          actorId: ctx.session.user.id,
          type: 'workspace.invitation_revoked',
          payload: { invitationId: invitation.id, email: invitation.email },
        });

        // Faz 8E (DEM-282) — davet iptali audit hattına: kim hangi e-postanın
        // pending davetini ne zaman geri çekti.
        await appendAudit(tx, {
          workspaceId: ctx.workspace.id,
          action: 'workspace.invitation.revoke',
          targetType: 'workspace',
          targetId: invitation.id,
          actorId: ctx.session.user.id,
          before: { status: 'pending', email: invitation.email },
          after: { status: 'revoked', email: invitation.email },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return { invitationId: invitation.id, revoked: true as const };
      });
    }),

  /** Invitations addressed to the current user's email — `pending` and not yet expired. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.session.user.email.trim().toLowerCase();
    return ctx.db
      .select({
        token: workspaceInvitations.token,
        workspaceId: workspaceInvitations.workspaceId,
        workspaceName: workspaces.name,
        role: workspaceInvitations.role,
        invitedByName: users.name,
        expiresAt: workspaceInvitations.expiresAt,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .innerJoin(workspaces, eq(workspaceInvitations.workspaceId, workspaces.id))
      .leftJoin(users, eq(workspaceInvitations.invitedById, users.id))
      .where(
        and(
          eq(workspaceInvitations.email, email),
          eq(workspaceInvitations.status, 'pending'),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(workspaceInvitations.createdAt));
  }),

  /**
   * Accept an invitation by token. The caller joins the workspace with the
   * invited role (idempotent if already a member). Email must match.
   */
  accept: protectedProcedure
    .input(acceptWorkspaceInvitationInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userEmail = ctx.session.user.email.trim().toLowerCase();

      // Expiry is handled *before* the transaction so the `expired` status
      // update is durable (it would be rolled back if done inside the tx that
      // then throws).
      const [pre] = await ctx.db
        .select({
          id: workspaceInvitations.id,
          status: workspaceInvitations.status,
          expiresAt: workspaceInvitations.expiresAt,
        })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.token, input.token))
        .limit(1);
      if (!pre) {
        throw new TRPCError({ code: 'NOT_FOUND', message: INVITATION_MESSAGES.notFound });
      }
      if (pre.status === 'pending' && pre.expiresAt.getTime() <= Date.now()) {
        await ctx.db
          .update(workspaceInvitations)
          .set({ status: 'expired' })
          .where(eq(workspaceInvitations.id, pre.id));
        throw new TRPCError({ code: 'BAD_REQUEST', message: INVITATION_MESSAGES.expired });
      }

      return ctx.db.transaction(async (tx) => {
        // Lock the invitation row so two concurrent `accept` calls serialize on
        // it — combined with `onConflictDoNothing` below, the second caller sees
        // the already-accepted status and returns the idempotent result.
        const [invitation] = await tx
          .select({
            id: workspaceInvitations.id,
            workspaceId: workspaceInvitations.workspaceId,
            email: workspaceInvitations.email,
            role: workspaceInvitations.role,
            status: workspaceInvitations.status,
            expiresAt: workspaceInvitations.expiresAt,
          })
          .from(workspaceInvitations)
          .where(eq(workspaceInvitations.token, input.token))
          .for('update')
          .limit(1);
        if (!invitation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: INVITATION_MESSAGES.notFound });
        }
        if (invitation.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVITATION_MESSAGES.noLongerValid });
        }
        if (invitation.expiresAt.getTime() <= Date.now()) {
          // Lost a race with expiry: bail; the next call flips the status.
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVITATION_MESSAGES.expired });
        }
        if (invitation.email.toLowerCase() !== userEmail) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: INVITATION_MESSAGES.wrongEmail,
          });
        }

        const [workspace] = await tx
          .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            icon: workspaces.icon,
            archivedAt: workspaces.archivedAt,
          })
          .from(workspaces)
          .where(eq(workspaces.id, invitation.workspaceId))
          .limit(1);
        if (!workspace || workspace.archivedAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
        }

        // Add the member iff not already present. `onConflictDoNothing` makes
        // this race-proof against a concurrent join (`workspace_members` PK is
        // `(workspace_id, user_id)`); `.returning()` tells us whether we added a
        // row, which gates the `member_added` activity event.
        const inserted = await tx
          .insert(workspaceMembers)
          .values({ workspaceId: invitation.workspaceId, userId, role: invitation.role })
          .onConflictDoNothing()
          .returning({ userId: workspaceMembers.userId });
        const didAdd = inserted.length > 0;

        // Always close the invitation — idempotent: re-accepting just re-stamps it.
        await tx
          .update(workspaceInvitations)
          .set({ status: 'accepted', acceptedById: userId, acceptedAt: new Date() })
          .where(eq(workspaceInvitations.id, invitation.id));

        if (didAdd) {
          await tx.insert(activityEvents).values({
            workspaceId: invitation.workspaceId,
            actorId: userId,
            type: 'workspace.member_added',
            payload: { userId, role: invitation.role, viaInvitation: invitation.id },
          });
        }

        return {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          icon: workspace.icon,
          role: invitation.role,
        };
      });
    }),

  /** Decline an invitation by token. Email must match. */
  decline: protectedProcedure
    .input(declineWorkspaceInvitationInput)
    .mutation(async ({ ctx, input }) => {
      const userEmail = ctx.session.user.email.trim().toLowerCase();

      return ctx.db.transaction(async (tx) => {
        const [invitation] = await tx
          .select({
            id: workspaceInvitations.id,
            email: workspaceInvitations.email,
            status: workspaceInvitations.status,
          })
          .from(workspaceInvitations)
          .where(eq(workspaceInvitations.token, input.token))
          .limit(1);
        if (!invitation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: INVITATION_MESSAGES.notFound });
        }
        if (invitation.email.toLowerCase() !== userEmail) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: INVITATION_MESSAGES.wrongEmail,
          });
        }
        if (invitation.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVITATION_MESSAGES.noLongerValid });
        }

        await tx
          .update(workspaceInvitations)
          .set({ status: 'declined' })
          .where(eq(workspaceInvitations.id, invitation.id));

        // No activity event: there's no `workspace.invitation_declined` type by design.
        return { token: input.token, declined: true as const };
      });
    }),
});

export const workspaceRouter = router({
  /**
   * Workspaces the current user is a member of (active, i.e. not archived).
   *
   * DEM-192 (Anasayfa Variant A) — each row is additively enriched with the
   * home screen's workspace card metadata: `boardCount` (active boards only),
   * `memberCount`, and `lastActivityAt`. The three aggregates each depend only
   * on the resolved `workspaceIds`, run in parallel (`Promise.all`), and are
   * skipped entirely when the user has no workspaces.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        icon: workspaces.icon,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(workspaces.createdAt);

    type CountRow = { workspaceId: string; value: number };
    type LastActivityRow = { workspaceId: string; lastActivityAt: Date | null };
    const workspaceIds = rows.map((row) => row.id);
    const [boardCountRows, memberCountRows, activityRows]: [
      CountRow[],
      CountRow[],
      LastActivityRow[],
    ] =
      workspaceIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            ctx.db
              .select({ workspaceId: boards.workspaceId, value: count() })
              .from(boards)
              .where(and(inArray(boards.workspaceId, workspaceIds), isNull(boards.archivedAt)))
              .groupBy(boards.workspaceId),
            ctx.db
              .select({ workspaceId: workspaceMembers.workspaceId, value: count() })
              .from(workspaceMembers)
              .where(inArray(workspaceMembers.workspaceId, workspaceIds))
              .groupBy(workspaceMembers.workspaceId),
            ctx.db
              .select({
                workspaceId: activityEvents.workspaceId,
                lastActivityAt: max(activityEvents.createdAt),
              })
              .from(activityEvents)
              .where(inArray(activityEvents.workspaceId, workspaceIds))
              .groupBy(activityEvents.workspaceId),
          ]);

    const boardCountByWorkspace = new Map<string, number>();
    for (const row of boardCountRows) boardCountByWorkspace.set(row.workspaceId, row.value);

    const memberCountByWorkspace = new Map<string, number>();
    for (const row of memberCountRows) memberCountByWorkspace.set(row.workspaceId, row.value);

    const lastActivityByWorkspace = new Map<string, Date | null>();
    for (const row of activityRows) {
      lastActivityByWorkspace.set(row.workspaceId, row.lastActivityAt);
    }

    return rows.map((row) => ({
      ...row,
      boardCount: boardCountByWorkspace.get(row.id) ?? 0,
      memberCount: memberCountByWorkspace.get(row.id) ?? 0,
      lastActivityAt: lastActivityByWorkspace.get(row.id) ?? null,
    }));
  }),

  /** Create a workspace. The creator becomes its `owner` member. */
  create: protectedProcedure.input(createWorkspaceInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const slug = input.slug ?? slugify(input.name);

    return ctx.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, slug))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Bu slug zaten kullanımda.' });
      }

      const [workspace] = await withSlugConflict(() =>
        tx
          .insert(workspaces)
          .values({ name: input.name, slug, icon: input.icon, ownerId: userId })
          .returning(),
      );
      if (!workspace) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId, role: 'owner' });

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: userId,
        type: 'workspace.created',
        payload: { name: workspace.name, slug: workspace.slug, icon: workspace.icon },
      });

      // Realtime publish + notification outbox are added in later phases.
      return workspace;
    });
  }),

  /** Workspace shell for a member. (Board list arrives in Phase 2.) */
  get: workspaceProcedure.query(async ({ ctx }) => {
    const [workspace] = await ctx.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        icon: workspaces.icon,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspace.id))
      .limit(1);
    if (!workspace) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
    }

    const memberCountRows = await ctx.db
      .select({ value: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ctx.workspace.id));

    return { ...workspace, role: ctx.workspace.role, memberCount: memberCountRows[0]?.value ?? 0 };
  }),

  /**
   * DEM-192 (Anasayfa Variant A) — workspace card counters for the home screen.
   * Any workspace member may read them (`workspaceProcedure`). All counters scan
   * `cards ⋈ boards` filtered to the workspace's *active* boards/cards (archived
   * boards and archived cards count nowhere). Two parallel queries:
   *  - the workspace-wide counters via `count(*) filter (...)`,
   *  - the "assigned to me" counters via a `card_members` (`assignee`) join.
   * Returns only what the data layer can derive: no "hedef" and no open-task /
   * overdue weekly delta (not computable from the current schema).
   */
  stats: workspaceProcedure.query(async ({ ctx }) => {
    const callerId = ctx.session.user.id;
    const activeWorkspaceCards = and(
      eq(boards.workspaceId, ctx.workspace.id),
      isNull(boards.archivedAt),
      isNull(cards.archivedAt),
    );

    const [overallRows, assignedRows] = await Promise.all([
      ctx.db
        .select({
          openCount: sql<number>`(count(*) filter (where ${cards.completed} = false))::int`,
          completedThisWeek: sql<number>`(count(*) filter (where ${cards.completed} = true and ${cards.completedAt} >= date_trunc('week', now())))::int`,
          completedLastWeek: sql<number>`(count(*) filter (where ${cards.completed} = true and ${cards.completedAt} >= date_trunc('week', now()) - interval '1 week' and ${cards.completedAt} < date_trunc('week', now())))::int`,
          overdueCount: sql<number>`(count(*) filter (where ${cards.completed} = false and ${cards.dueAt} is not null and ${cards.dueAt} < now()))::int`,
        })
        .from(cards)
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(activeWorkspaceCards),
      ctx.db
        .select({
          assignedToMeOpen: sql<number>`(count(*) filter (where ${cards.completed} = false))::int`,
          assignedToMeDueToday: sql<number>`(count(*) filter (where ${cards.completed} = false and ${cards.dueAt} >= date_trunc('day', now()) and ${cards.dueAt} < date_trunc('day', now()) + interval '1 day'))::int`,
        })
        .from(cardMembers)
        .innerJoin(cards, eq(cards.id, cardMembers.cardId))
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(
          and(
            eq(cardMembers.userId, callerId),
            eq(cardMembers.role, 'assignee'),
            activeWorkspaceCards,
          ),
        ),
    ]);

    const overall = overallRows[0];
    const assigned = assignedRows[0];
    return {
      openCount: overall?.openCount ?? 0,
      completedThisWeek: overall?.completedThisWeek ?? 0,
      completedLastWeek: overall?.completedLastWeek ?? 0,
      overdueCount: overall?.overdueCount ?? 0,
      assignedToMeOpen: assigned?.assignedToMeOpen ?? 0,
      assignedToMeDueToday: assigned?.assignedToMeDueToday ?? 0,
    };
  }),

  /** Update workspace name and/or slug. Requires `admin+`. */
  update: workspaceProcedure.input(updateWorkspaceInput).mutation(async ({ ctx, input }) => {
    if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Workspace ayarlarını değiştirme yetkiniz yok.',
      });
    }
    if (input.name === undefined && input.slug === undefined && input.icon === undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Güncellenecek bir alan belirtin (name, slug veya icon).',
      });
    }

    const workspaceCols = {
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      icon: workspaces.icon,
      ownerId: workspaces.ownerId,
      createdAt: workspaces.createdAt,
    } as const;

    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select(workspaceCols)
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      if (input.slug !== undefined && input.slug !== current.slug) {
        const [clash] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.slug, input.slug))
          .limit(1);
        if (clash) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Bu slug zaten kullanımda.' });
        }
      }

      const patch: { name?: string; slug?: string; icon?: string } = {};
      if (input.name !== undefined && input.name !== current.name) patch.name = input.name;
      if (input.slug !== undefined && input.slug !== current.slug) patch.slug = input.slug;
      if (input.icon !== undefined && input.icon !== current.icon) patch.icon = input.icon;

      if (Object.keys(patch).length === 0) {
        return { ...current, changed: false as const };
      }

      const [updated] = await withSlugConflict(() =>
        tx
          .update(workspaces)
          .set(patch)
          .where(eq(workspaces.id, ctx.workspace.id))
          .returning(workspaceCols),
      );
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        type: 'workspace.updated',
        payload: {
          ...(patch.name !== undefined ? { fromName: current.name, toName: patch.name } : {}),
          ...(patch.slug !== undefined ? { fromSlug: current.slug, toSlug: patch.slug } : {}),
          ...(patch.icon !== undefined ? { fromIcon: current.icon, toIcon: patch.icon } : {}),
        },
      });

      return { ...updated, changed: true as const };
    });
  }),

  /** Soft-archive a workspace (`archived_at`). Owner only. */
  archive: workspaceProcedure.input(archiveWorkspaceInput).mutation(async ({ ctx }) => {
    if (ctx.workspace.role !== 'owner') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Yalnızca owner workspace arşivleyebilir.',
      });
    }

    return ctx.db.transaction(async (tx) => {
      const archivedAt = new Date();
      const [archived] = await tx
        .update(workspaces)
        .set({ archivedAt })
        .where(and(eq(workspaces.id, ctx.workspace.id), isNull(workspaces.archivedAt)))
        .returning({ id: workspaces.id, archivedAt: workspaces.archivedAt });
      if (!archived) {
        // Already archived (or deleted): the middleware would normally 404 first,
        // but guard against a race.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        type: 'workspace.archived',
        payload: { archivedAt: archived.archivedAt?.toISOString() ?? archivedAt.toISOString() },
      });

      return { id: archived.id, archivedAt: archived.archivedAt };
    });
  }),

  /**
   * Permanently delete a workspace — *hard* delete, irreversible. This is a
   * different concept from `archive` (which only sets `archived_at`); this
   * procedure never touches `archived_at`. Owner only. The caller must echo the
   * workspace `name` in `confirmName` (typed-to-confirm guard). One `DELETE FROM
   * workspaces` row removal; FK cascades clean up `workspace_members`,
   * `workspace_invitations` (and, later, boards/lists/cards/…). No activity
   * event / notification is written — the workspace and any in-DB trace go away
   * with the cascade (see docs/domain/02-yetkilendirme-kurallari.md).
   */
  delete: workspaceProcedure.input(deleteWorkspaceInput).mutation(async ({ ctx, input }) => {
    if (ctx.workspace.role !== 'owner') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yalnızca owner workspace silebilir.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .limit(1);
      if (!current) {
        // The middleware already loaded it; a race could still delete it.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }
      if (input.confirmName !== current.name) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Onay için workspace adını tam yazın.',
        });
      }

      // Faz 8E (DEM-282) — workspace silme forensic audit'e yazılır.
      // `audit_log.workspace_id` FK ON DELETE CASCADE olduğu için aynı tx
      // içinde önce audit insert + sonra workspace delete + cascade audit
      // wipe akışı çalışır (audit kayıt insert edilir → workspace delete
      // tetikleyince cascade audit'i de düşürür). Audit önceden yazılır ki
      // delete başarısız olursa (FK RESTRICT'li başka tablodan, mesela
      // realtime_events) audit de yazılmamış olsun.
      await appendAudit(tx, {
        workspaceId: ctx.workspace.id,
        action: 'workspace.delete',
        targetType: 'workspace',
        targetId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        before: { name: current.name },
        after: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      const [deleted] = await tx
        .delete(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .returning({ id: workspaces.id });
      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      return { id: deleted.id, deleted: true as const };
    });
  }),

  members: workspaceMembersRouter,
  invitations: workspaceInvitationsRouter,
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : suffix;
}

/** True if `err` (or its cause) is a Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown): unknown =>
    typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined;
  if (codeOf(err) === '23505') return true;
  return typeof err === 'object' && err !== null && 'cause' in err
    ? codeOf((err as { cause: unknown }).cause) === '23505'
    : false;
}

/**
 * Runs `fn`, translating a Postgres unique-constraint violation into a `CONFLICT`.
 * The only user-input-driven unique constraint on `workspaces` is the slug index,
 * so a 23505 from a workspace insert/update means the slug is already taken. The
 * pre-checks in `create`/`update` give a fast, friendly path for the common case;
 * this guards the check-then-write race.
 */
async function withSlugConflict<T>(fn: () => PromiseLike<T>): Promise<T> {
  return withConflict(fn, 'Bu slug zaten kullanımda.');
}

/** Runs `fn`, translating a Postgres unique-constraint violation (23505) into a `CONFLICT` with `message`. */
async function withConflict<T>(fn: () => PromiseLike<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TRPCError({ code: 'CONFLICT', message });
    }
    throw err;
  }
}
