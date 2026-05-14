/**
 * Card-members router — Phase 2.5B (DEM-51). Nested under `card.members.*`:
 * `card.members.{list,add,remove}`. All run on `cardProcedure` (board `viewer+`
 * visibility already enforced) — the procedure body adds the finer role check
 * with `@pusula/domain/permissions`:
 * - `list`   — board `viewer+` (the procedure already guarantees it).
 * - `add`    — board `member+` (`canEditBoardContent`) **unless** the caller is
 *              adding *themselves* as a `watcher`, in which case board `viewer+`
 *              suffices (a watcher follows a card; a viewer may follow).
 * - `remove` — board `member+` **unless** the caller is removing *themselves*
 *              (any role), in which case board `viewer+` suffices.
 *
 * The candidate added as a card member must be able to reach the board, per
 * `docs/domain/01-urun-modeli.md` invariant 12: they need a `workspace_members`
 * row in the card's workspace (else `BAD_REQUEST` "not a workspace member") and a
 * non-null `effectiveBoardRole` (workspace `guest` with no explicit
 * `board_members` row → `BAD_REQUEST` "no board access").
 *
 * Each mutation's transaction contains only the domain change + (when applicable)
 * the `activity_events` insert + the `boards.version` bump (Phase 2.5 scope —
 * realtime/notification outbox land in Phase 5/6). An archived board is
 * read-only: every mutation re-reads `boards.archived_at` inside its
 * transaction. Mutations are idempotent: re-adding an existing
 * `(cardId, userId, role)` row, or removing one that isn't there, returns
 * `{ ..., changed: false }` without writing activity or bumping `version`.
 *
 * Activity taxonomy (per `docs/domain/05-aktivite-kurallari.md`): `add` →
 * `card.member_added`, `remove` → `card.member_removed` — payload
 * `{ cardId, userId, role }`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — card.members procedure'leri)
 * and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { and, eq, sql } from '@pusula/db';
import { activityEvents, boardMembers, boards, cardMembers, users, workspaceMembers } from '@pusula/db';
import {
  addCardMemberInput,
  canEditBoardContent,
  canViewBoard,
  effectiveBoardRole,
  removeCardMemberInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import { router } from '../trpc';

export const cardMembersRouter = router({
  /**
   * List a card's members (`assignee` / `watcher` rows), joined with the user's
   * display name. Board `viewer+` (already enforced by `cardProcedure`). No
   * transaction (read-only). The user's e-mail is intentionally **not** returned
   * — `cardProcedure` is open to board `viewer+`, and a viewer should not be able
   * to enumerate card members' e-mail addresses (Trello-style: the name is enough).
   */
  list: cardProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        userId: cardMembers.userId,
        role: cardMembers.role,
        name: users.name,
      })
      .from(cardMembers)
      .leftJoin(users, eq(users.id, cardMembers.userId))
      .where(eq(cardMembers.cardId, ctx.card.id));
  }),

  /**
   * Add a card member (`assignee` / `watcher`). Board `member+` only, except a
   * board `viewer` may add *themselves* as a `watcher`. The candidate must be
   * able to reach the card's board (workspace member + non-null effective board
   * role). An archived board is read-only. Idempotent: re-adding an existing
   * `(cardId, userId, role)` triple returns `{ ..., changed: false }` without
   * writing activity or bumping `version`; otherwise writes a `card.member_added`
   * activity event and bumps `boards.version`.
   */
  add: cardProcedure.input(addCardMemberInput).mutation(async ({ ctx, input }) => {
    const selfWatch = input.userId === ctx.session.user.id && input.role === 'watcher';
    const access = accessFromBoardRole(ctx.card.boardRole);
    if (!(selfWatch ? canViewBoard(access) : canEditBoardContent(access))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Karta üye ekleme yetkiniz yok.' });
    }

    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      // The candidate must be able to reach the card's board (invariant 12).
      const [wsMember] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.card.workspaceId),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!wsMember) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Bu kişi workspace'in üyesi değil." });
      }
      const [boardMember] = await tx
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(and(eq(boardMembers.boardId, ctx.card.boardId), eq(boardMembers.userId, input.userId)))
        .limit(1);
      const candidateRole = effectiveBoardRole({
        workspaceRole: wsMember.role,
        boardRole: boardMember?.role ?? null,
      });
      if (!candidateRole) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Bu kişinin board'a erişimi yok." });
      }

      const inserted = await tx
        .insert(cardMembers)
        .values({ cardId: ctx.card.id, userId: input.userId, role: input.role })
        .onConflictDoNothing()
        .returning({ cardId: cardMembers.cardId });
      if (inserted.length === 0) {
        return { cardId: ctx.card.id, userId: input.userId, role: input.role, changed: false as const };
      }

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'card.member_added',
          payload: { cardId: ctx.card.id, userId: input.userId, role: input.role },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      // Faz 6A (DEM-90) — fan out the notification outbox rows for this
      // activity event inside the same tx (so a rollback also drops them).
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'card.member_added',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: { cardId: ctx.card.id, userId: input.userId, role: input.role },
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      return { cardId: ctx.card.id, userId: input.userId, role: input.role, changed: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Remove a card member (`assignee` / `watcher`). Board `member+` only, except
   * the caller may remove *themselves* (any role). An archived board is
   * read-only. Idempotent: removing a `(cardId, userId, role)` triple that isn't
   * there returns `{ ..., changed: false }` without writing activity or bumping
   * `version`; otherwise writes a `card.member_removed` activity event and bumps
   * `boards.version`.
   */
  remove: cardProcedure.input(removeCardMemberInput).mutation(async ({ ctx, input }) => {
    const isSelf = input.userId === ctx.session.user.id;
    const access = accessFromBoardRole(ctx.card.boardRole);
    if (!(isSelf ? canViewBoard(access) : canEditBoardContent(access))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Karttan üye çıkarma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const deleted = await tx
        .delete(cardMembers)
        .where(
          and(
            eq(cardMembers.cardId, ctx.card.id),
            eq(cardMembers.userId, input.userId),
            eq(cardMembers.role, input.role),
          ),
        )
        .returning({ cardId: cardMembers.cardId });
      if (deleted.length === 0) {
        return { cardId: ctx.card.id, userId: input.userId, role: input.role, changed: false as const };
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        type: 'card.member_removed',
        payload: { cardId: ctx.card.id, userId: input.userId, role: input.role },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      return { cardId: ctx.card.id, userId: input.userId, role: input.role, changed: true as const };
    });
  }),
});
