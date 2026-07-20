/**
 * Board-members router — Phase 2.5C (DEM-52). Nested under `board.members.*`:
 * `board.members.{list,add,updateRole,remove}`. All run on `boardProcedure`
 * (input carries `boardId`; board `viewer+` visibility already enforced) — the
 * procedure body adds the finer role check with `@pusula/domain/permissions`:
 * - `list`       — board `viewer+` (the procedure already guarantees it).
 * - `add`        — board `admin` (`canManageBoard`).
 * - `updateRole` — board `admin`.
 * - `remove`     — board `admin`, **unless** the caller is removing *themselves*
 *                  (board `viewer+` — anyone may leave a board).
 *
 * `list` returns the union of *explicit* `board_members` rows and the workspace
 * `owner`/`admin`s who have an effective board `admin` role *without* an explicit
 * row (`inherited: true`). Each row carries the account **e-mail** — the web
 * board-settings UI shows it to disambiguate members whose names collide
 * (DEM-157). The public REST adapter (`/api/v1/board/members`) strips `email`
 * before returning to a bot (PII minimization — M1); the procedure itself keeps
 * it for the trusted web caller.
 *
 * `add` resolves the target by email: (a) a user that already has an account is
 * added straight to `board_members` (creating a workspace `guest` membership
 * first if they aren't a workspace member yet — invariant 12); (b) an email with
 * no account yet creates a `pending` `board_invitations` row + a `board.member_invited`
 * activity + a `board_invitation`/`email` `notification_outbox` row. The token is
 * never returned in the response; it travels only in the email payload. Delivery
 * is the worker's job (Phase 6).
 *
 * Each mutation's transaction contains only the domain change + the `activity_events`
 * insert(s) + the `boards.version` bump (Phase 2.5 scope — realtime publishing
 * lands in Phase 5). An archived board is read-only: every mutation re-reads
 * `boards.archived_at` inside its transaction. The last explicit board `admin`
 * cannot be demoted or removed (`BAD_REQUEST`).
 *
 * Activity taxonomy (per `docs/domain/05-aktivite-kurallari.md`): `add` →
 * `board.member_added` (account path) / `board.member_invited` (invitation path);
 * `updateRole` → `board.member_role_changed`; `remove` → `board.member_removed`.
 * A lazily-created workspace `guest` membership also writes `workspace.member_added`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — board.members procedure'leri)
 * and `docs/domain/02-yetkilendirme-kurallari.md` (Board davet akışı).
 */
import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, sql } from '@pusula/db';
import {
  activityEvents,
  boardInvitations,
  boardMembers,
  boards,
  notificationOutbox,
  users,
  workspaceMembers,
} from '@pusula/db';
import {
  WORKSPACE_INVITATION_TTL_DAYS,
  addBoardMemberInput,
  canManageBoard,
  canViewBoard,
  removeBoardMemberInput,
  updateBoardMemberRoleInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import { appendAudit } from '../lib/audit-log';
import { removeCardMembershipsOnBoard } from '../lib/card-members-cleanup';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import type { Queryable } from '../middleware/board-access';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import {
  bumpBoardVersionForRealtime,
  insertRealtimeEvent,
  maybeEnqueueRealtimePublish,
} from '../lib/realtime-publish';
import { router } from '../trpc';

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
 * Two `board.members.add` writes are reachable under a check-then-write race:
 * the invitation insert (`board_invitations_pending_email_uq` — a concurrent
 * caller already created the `pending` invitation) and the `board_members` insert
 * (PK `(board_id, user_id)` — a concurrent caller already added the same person).
 * The pre-checks above are the fast/friendly path; this guards the race window.
 */
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

/** Cryptographically-random, single-use board-invitation token (64 hex chars from 32 bytes). */
const newInvitationToken = () => randomBytes(32).toString('hex');

/**
 * Reject a bot service account as a member-management *target* (MAJOR-3). A bot's
 * board membership + role are governed solely by the board's API-key section
 * (`board.apiKeys.*`); the human member surface (`updateRole`/`remove`) must not
 * touch it. See `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
async function assertNotBotTarget(db: Queryable, userId: string): Promise<void> {
  const [target] = await db
    .select({ isBot: users.isBot })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (target?.isBot) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bot üyeliği yalnız API anahtarı yönetiminden değiştirilebilir.',
    });
  }
}

/** Count of explicit `board_members` rows with role `admin` on this board. */
async function explicitAdminCount(db: Queryable, boardId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, 'admin')));
  return row?.value ?? 0;
}

export const boardMembersRouter = router({
  /**
   * Members with access to this board: every explicit `board_members` row
   * (`inherited: false`), plus workspace `owner`/`admin`s who have an effective
   * board `admin` role without an explicit row (`inherited: true`). Board
   * `viewer+` (already enforced by `boardProcedure`). No transaction (read-only).
   * Each row includes the account e-mail for the web settings UI (DEM-157); the
   * public REST adapter strips it before a bot sees it (M1 — see header).
   */
  list: boardProcedure.query(async ({ ctx }) => {
    const explicit = await ctx.db
      .select({
        userId: boardMembers.userId,
        role: boardMembers.role,
        name: users.name,
        email: users.email,
        image: users.image,
        // Public API + Bot (Task 8) — bot servis hesapları `board_members`
        // satırıyla üye görünür; UI'da yanlarında "Bot" rozeti gösterilir.
        isBot: users.isBot,
        createdAt: boardMembers.createdAt,
      })
      .from(boardMembers)
      .leftJoin(users, eq(users.id, boardMembers.userId))
      .where(eq(boardMembers.boardId, ctx.board.id))
      .orderBy(asc(boardMembers.createdAt));

    const explicitIds = new Set(explicit.map((r) => r.userId));

    // Workspace owner/admins inherit board `admin` unless they have an explicit row.
    const inheritedAdmins = await ctx.db
      .select({
        userId: workspaceMembers.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.board.workspaceId),
          sql`${workspaceMembers.role} in ('owner', 'admin')`,
        ),
      )
      .orderBy(asc(workspaceMembers.createdAt));

    return [
      ...explicit.map((r) => ({
        userId: r.userId,
        role: r.role,
        name: r.name,
        email: r.email,
        image: r.image,
        isBot: r.isBot ?? false,
        inherited: false as const,
      })),
      ...inheritedAdmins
        .filter((r) => !explicitIds.has(r.userId))
        .map((r) => ({
          userId: r.userId,
          role: 'admin' as const,
          name: r.name,
          email: r.email,
          image: r.image,
          // Workspace owner/admin'ler insan (bot yalnız `guest` üyeliğiyle gelir).
          isBot: false as const,
          inherited: true as const,
        })),
    ];
  }),

  /**
   * Add an email address to the board with a board role. Board `admin` only. An
   * archived board is read-only.
   *  - The email already has an account → add a `board_members` row (creating a
   *    workspace `guest` membership first if they aren't a workspace member yet),
   *    write `board.member_added` (and `workspace.member_added` if a guest row was
   *    created), bump `boards.version`. Already an explicit board member → `CONFLICT`.
   *  - The email has no account yet → create a `pending` `board_invitations` row +
   *    a `board.member_invited` activity + a `board_invitation`/`email`
   *    `notification_outbox` row, bump `boards.version`. Another pending invite for
   *    the same email → `CONFLICT`. The token is never returned.
   */
  add: boardProcedure.input(addBoardMemberInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board üyesi ekleme yetkiniz yok.' });
    }
    const email = input.email; // already trimmed + lowercased by `emailSchema`
    // DEM-298 — caller cannot invite themselves (UI prevents it too; this is
    // the server-side defense-in-depth). Match against the session e-mail in
    // its normalized form so case differences don't slip through.
    if (ctx.session.user.email.trim().toLowerCase() === email) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kendinizi davet edemezsiniz.' });
    }

    let notificationEventId: string | undefined;
    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ id: boards.id, title: boards.title, archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      assertNotArchived('board', board);

      const bumpVersion = () => bumpBoardVersionForRealtime(tx, ctx.board.id);

      const [existingUser] = await tx
        .select({ id: users.id, name: users.name, isBot: users.isBot })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      // Task 9 (Public API + Bot) — bir bot servis hesabı insan davet/ekle
      // yüzeyinden board'a alınamaz; bot üyeliği yalnız API key yönetimiyle
      // kurulur. `docs/domain/10-bot-ve-api-key-kurallari.md`.
      if (existingUser?.isBot) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bot hesabı board üyesi olarak eklenemez.',
        });
      }

      // ---- (a) the email already has an account -----------------------------
      if (existingUser) {
        const [alreadyBoardMember] = await tx
          .select({ userId: boardMembers.userId })
          .from(boardMembers)
          .where(
            and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, existingUser.id)),
          )
          .limit(1);
        if (alreadyBoardMember) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Bu kişi zaten board üyesi.' });
        }

        const [wsMember] = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.board.workspaceId),
              eq(workspaceMembers.userId, existingUser.id),
            ),
          )
          .limit(1);

        let addedAsGuest = false;
        if (!wsMember) {
          const inserted = await tx
            .insert(workspaceMembers)
            .values({ workspaceId: ctx.board.workspaceId, userId: existingUser.id, role: 'guest' })
            .onConflictDoNothing()
            .returning({ userId: workspaceMembers.userId });
          if (inserted.length > 0) {
            addedAsGuest = true;
            await tx.insert(activityEvents).values({
              workspaceId: ctx.board.workspaceId,
              actorId: ctx.session.user.id,
              type: 'workspace.member_added',
              payload: { userId: existingUser.id, role: 'guest', viaBoardId: ctx.board.id },
            });
          }
        }

        const insertedMember = await withConflict(
          () =>
            tx
              .insert(boardMembers)
              .values({ boardId: ctx.board.id, userId: existingUser.id, role: input.role })
              .onConflictDoNothing()
              .returning({ userId: boardMembers.userId }),
          'Bu kişi zaten board üyesi.',
        );
        if (insertedMember.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Bu kişi zaten board üyesi.' });
        }

        const addedPayload = { userId: existingUser.id, role: input.role };
        const [addedActivity] = await tx
          .insert(activityEvents)
          .values({
            workspaceId: ctx.board.workspaceId,
            boardId: ctx.board.id,
            actorId: ctx.session.user.id,
            type: 'board.member_added',
            payload: addedPayload,
          })
          .returning({ id: activityEvents.id });
        if (!addedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Faz 6A (DEM-90) — fan out in-app + email notification to the
        // newly added user. `board_invitation` is mute-bypass.
        const addedDispatched = await dispatchNotificationsForActivity(tx, {
          id: addedActivity.id,
          type: 'board.member_added',
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          cardId: null,
          actorId: ctx.session.user.id,
          payload: addedPayload,
        });
        if (addedDispatched.inserted > 0) notificationEventId = addedActivity.id;

        const seq = await bumpVersion();
        realtimeEventId = await insertRealtimeEvent(tx, {
          type: 'board.member_added',
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          clientMutationId: ctx.clientMutationId,
          seq,
          data: {
            userId: existingUser.id,
            role: input.role,
            member: {
              userId: existingUser.id,
              role: input.role,
              name: existingUser.name,
              inherited: false,
            },
          },
        });

        return {
          kind: (addedAsGuest ? 'added_as_guest' : 'added') as 'added' | 'added_as_guest',
          userId: existingUser.id,
          role: input.role,
        };
      }

      // ---- (b) the email has no account yet → create a pending invitation ---
      const [pendingInvite] = await tx
        .select({ id: boardInvitations.id })
        .from(boardInvitations)
        .where(
          and(
            eq(boardInvitations.boardId, ctx.board.id),
            sql`lower(${boardInvitations.email}) = ${email}`,
            eq(boardInvitations.status, 'pending'),
          ),
        )
        .limit(1);
      if (pendingInvite) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Bu e-postaya zaten bir davet gönderilmiş.',
        });
      }

      const token = newInvitationToken();
      const expiresAt = new Date(Date.now() + WORKSPACE_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

      const [invitation] = await withConflict(
        () =>
          tx
            .insert(boardInvitations)
            .values({
              boardId: ctx.board.id,
              email,
              role: input.role,
              token,
              invitedById: ctx.session.user.id,
              status: 'pending',
              expiresAt,
            })
            .returning({ id: boardInvitations.id }),
        'Bu e-postaya zaten bir davet gönderilmiş.',
      );
      if (!invitation) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.member_invited',
          // Faz 6 review fix (W2 DEM-91): activity payload'unda `inviteToken`
          // YOK — token in-app notification payload'una sızmasın diye
          // notification-rules whitelist'i de `inviteToken`'i taşımaz. Token
          // sadece direct email outbox satırında (aşağıda) yer alır; worker
          // template `inviteToken` adıyla okuyor, key adı orada da hizalandı.
          payload: { invitationId: invitation.id, email, role: input.role },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Email channel — the recipient has no account yet (recipientId = null);
      // the worker reads the target address from payload.email.
      await tx.insert(notificationOutbox).values({
        channel: 'email',
        eventId: activity.id,
        recipientId: null,
        actorId: ctx.session.user.id,
        type: 'board_invitation',
        payload: {
          boardId: ctx.board.id,
          // DEM-173 — worker `pickSubject` `boardName` arar; `actorName` davet
          // e-postasında davet eden kişiyi gösterir (ikisi de eksikti).
          boardName: board.title,
          workspaceId: ctx.board.workspaceId,
          email,
          role: input.role,
          inviteToken: token,
          invitedById: ctx.session.user.id,
          actorName: ctx.session.user.name,
        },
      });

      const seq = await bumpVersion();
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.member_invited',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { invitationId: invitation.id, email, role: input.role },
      });
      // (b)-branch outbox row above (`channel: 'email'`) gets handed to the
      // worker by the same `enqueueNotificationPublish` hook the (a)-branch
      // uses — surface its event id so the producer below picks it up.
      notificationEventId = activity.id;

      return { kind: 'invited' as const, email, role: input.role };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Change an *explicit* board member's role. Board `admin` only. An archived
   * board is read-only. Only explicit `board_members` rows can be re-roled — a
   * workspace `owner`/`admin` who merely *inherits* board `admin` has no row to
   * change (`BAD_REQUEST`). Idempotent: an unchanged role returns
   * `{ ..., changed: false }`. The last explicit board `admin` cannot be demoted
   * (`BAD_REQUEST`). Writes `board.member_role_changed` + bumps `boards.version`
   * on a real change.
   */
  updateRole: boardProcedure.input(updateBoardMemberRoleInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye rolünü değiştirme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      assertNotArchived('board', board);

      await assertNotBotTarget(tx, input.userId);

      // `.for('update')` locks the target row so two concurrent demote/remove
      // calls serialize — neither can read `explicitAdminCount > 1` against a
      // stale snapshot and strand the board without an admin.
      const [member] = await tx
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, input.userId)))
        .for('update')
        .limit(1);
      if (!member) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Bu kişi açık board üyesi değil; workspace yöneticisinin board rolü değiştirilemez.',
        });
      }
      if (member.role === input.role) {
        return { userId: input.userId, role: input.role, changed: false as const };
      }
      if (
        member.role === 'admin' &&
        input.role !== 'admin' &&
        (await explicitAdminCount(tx, ctx.board.id)) <= 1
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Son board admini rolden düşürülemez.',
        });
      }

      await tx
        .update(boardMembers)
        .set({ role: input.role })
        .where(and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, input.userId)));

      const roleChangePayload = {
        // Faz 10A (DEM-135): alıcı `targetUserId` (rule engine bunu okur);
        // `userId` legacy alanını da koruyoruz (activity feed payload sözleşmesi).
        userId: input.userId,
        targetUserId: input.userId,
        fromRole: member.role,
        toRole: input.role,
      };
      const [roleActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.member_role_changed',
          payload: roleChangePayload,
        })
        .returning({ id: activityEvents.id });
      if (!roleActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Faz 10A (DEM-135) — rolü değişen kişiye in-app `member_role_changed`
      // bildirimi. Kullanıcı hâlâ board/workspace üyesi olduğu için normal
      // permission filter geçer; aktör self-skip uygulanır.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: roleActivity.id,
        type: 'board.member_role_changed',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: roleChangePayload,
      });
      if (dispatched.inserted > 0) notificationEventId = roleActivity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.member_role_changed',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { userId: input.userId, oldRole: member.role, newRole: input.role },
      });

      // Faz 8E (DEM-282) — board permission değişimi forensic audit'e yazılır.
      await appendAudit(tx, {
        workspaceId: ctx.board.workspaceId,
        action: 'board.member.role_change',
        targetType: 'user',
        targetId: input.userId,
        actorId: ctx.session.user.id,
        before: { boardId: ctx.board.id, role: member.role },
        after: { boardId: ctx.board.id, role: input.role },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return { userId: input.userId, role: input.role, changed: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Remove an *explicit* board member. Board `admin` only, **unless** the caller
   * is removing themselves (board `viewer+` — anyone may leave a board). An
   * archived board is read-only. Only explicit `board_members` rows can be
   * removed — a workspace `owner`/`admin` who merely inherits board access has no
   * row (`NOT_FOUND`). The last explicit board `admin` cannot be removed
   * (`BAD_REQUEST`). Card memberships/assignments are preserved while the
   * member keeps effective access via a non-guest workspace role; if the seat
   * was their only access (ws `guest`), their card memberships on this board
   * are deleted in the same tx (invariant 24 — 2026-07-20). Writes
   * `board.member_removed` + bumps `boards.version`.
   */
  remove: boardProcedure.input(removeBoardMemberInput).mutation(async ({ ctx, input }) => {
    const isSelf = input.userId === ctx.session.user.id;
    const access = accessFromBoardRole(ctx.board.role);
    if (!(isSelf ? canViewBoard(access) : canManageBoard(access))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board üyesi çıkarma yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      assertNotArchived('board', board);

      // A self-leave is legitimate for humans; the bot guard below only bites a
      // bot *target*, and a bot is never the caller (bots can't sign in).
      await assertNotBotTarget(tx, input.userId);

      // `.for('update')` locks the target row so two concurrent demote/remove
      // calls serialize — neither can read `explicitAdminCount > 1` against a
      // stale snapshot and strand the board without an admin.
      const [member] = await tx
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, input.userId)))
        .for('update')
        .limit(1);
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bu kişi açık board üyesi değil.' });
      }
      if (member.role === 'admin' && (await explicitAdminCount(tx, ctx.board.id)) <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Son board admini çıkarılamaz.' });
      }

      await tx
        .delete(boardMembers)
        .where(and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, input.userId)));

      // Invariant 24 (2026-07-20) — koltuk gidince geriye efektif erişim
      // kalmadıysa (ws `guest` + explicit satır yok) bu panodaki kart
      // üyelikleri de düşer. Non-guest ws üyesi panoya ws rolüyle erişmeye
      // devam eder → atamaları korunur.
      const [wsRow] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.board.workspaceId),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!wsRow || wsRow.role === 'guest') {
        await removeCardMembershipsOnBoard(tx, ctx.board.id, input.userId);
      }

      const removedPayload = {
        // Faz 10A (DEM-135): alıcı `removedUserId` (rule engine bunu okur);
        // `userId` legacy alanını da koruyoruz (activity feed sözleşmesi).
        userId: input.userId,
        removedUserId: input.userId,
        removedRole: member.role,
        self: isSelf,
      };
      const [removedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.member_removed',
          payload: removedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!removedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Faz 10A (DEM-135) — çıkarılan kullanıcıya in-app + email
      // `member_removed` bildirimi. Permission filter atlar: alıcı artık
      // board_members'ta yok ama bildirim gitmek zorunda. Aktör (kendisini
      // çıkaran) self-skip alır.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: removedActivity.id,
        type: 'board.member_removed',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: removedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = removedActivity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.member_removed',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { userId: input.userId, role: member.role },
      });

      // Faz 8E (DEM-282) — üye çıkarma forensic audit'e yazılır (self-leave dahil).
      await appendAudit(tx, {
        workspaceId: ctx.board.workspaceId,
        action: 'board.member.remove',
        targetType: 'user',
        targetId: input.userId,
        actorId: ctx.session.user.id,
        before: { boardId: ctx.board.id, role: member.role },
        after: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return { userId: input.userId, changed: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),
});
