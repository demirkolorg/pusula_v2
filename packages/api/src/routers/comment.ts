/**
 * Comment router — Phase 2.5A (DEM-50): `comment.list` / `comment.create` /
 * `comment.update` / `comment.delete`. All run on `cardProcedure`, so board
 * `viewer+` visibility is already enforced; the procedure body adds the finer
 * role check with `@pusula/domain/permissions`:
 * - `list`   — board `viewer+` (the procedure already guarantees it).
 * - `create` — board `member+` (`canEditBoardContent`).
 * - `update` — board `member+` **and** (`authorId === userId` || board `admin`).
 * - `delete` — board `member+` **and** (`authorId === userId` || board `admin`).
 *
 * Each mutation's transaction contains only the domain change + the
 * `activity_events` insert + the `boards.version` bump (Phase 2.5 scope —
 * realtime/notification outbox land in Phase 5/6). An archived board is
 * read-only: every mutation re-reads `boards.archived_at` inside its
 * transaction. `delete` is a soft-delete (`deleted_at` set + `body` cleared so
 * no stale text leaks; the UI shows a "deleted" placeholder); `list` returns
 * soft-deleted rows too (with the empty body) so the client can render that
 * placeholder in order. Mutations are idempotent: a no-op `update` (same body)
 * or `delete` (already deleted) returns `{ ..., changed: false }` without
 * writing activity or bumping `version`.
 *
 * Activity taxonomy (per `docs/domain/05-aktivite-kurallari.md`):
 * `create` → `comment.created`, `update` → `comment.updated`, `delete` →
 * `comment.deleted` — payload `{ commentId, cardId }`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — comment procedure'leri) and
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / Card içerik procedure
 * haritası — Faz 2.5).
 */
import { asc, eq, sql } from '@pusula/db';
import { activityEvents, boards, comments } from '@pusula/db';
import {
  canEditBoardContent,
  canManageBoard,
  createCommentInput,
  deleteCommentInput,
  updateCommentInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import { router } from '../trpc';

/** Columns of a full comment row returned to clients. */
const commentCols = {
  id: comments.id,
  cardId: comments.cardId,
  authorId: comments.authorId,
  body: comments.body,
  editedAt: comments.editedAt,
  deletedAt: comments.deletedAt,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
} as const;

export const commentRouter = router({
  /**
   * List a card's comments in ascending `created_at` order. Board `viewer+`
   * (already enforced by `cardProcedure`). Includes soft-deleted rows (their
   * `body` is empty) so the client can render a "deleted" placeholder in place.
   * No transaction (read-only).
   */
  list: cardProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select(commentCols)
      .from(comments)
      .where(eq(comments.cardId, ctx.card.id))
      .orderBy(asc(comments.createdAt));
  }),

  /**
   * Add a comment to a card. Board `member+` only. The card's board must be
   * active. Writes a `comment.created` activity event and bumps `boards.version`
   * in the same transaction.
   */
  create: cardProcedure.input(createCommentInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yorum ekleme yetkiniz yok.' });
    }

    let notificationEventId: string | undefined;
    const created = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Arşivli board'a yorum eklenemez." });
      }

      const [createdComment] = await tx
        .insert(comments)
        .values({ cardId: ctx.card.id, authorId: ctx.session.user.id, body: input.body })
        .returning(commentCols);
      if (!createdComment) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.created',
          payload: { commentId: createdComment.id, cardId: ctx.card.id },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      // Faz 6A (DEM-90) — fan out notification outbox rows for card watchers
      // (the actor is self-skipped by the rule engine).
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'comment.created',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: { commentId: createdComment.id, cardId: ctx.card.id },
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      return createdComment;
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return created;
  }),

  /**
   * Edit a comment's body. Board `member+` and either the comment's author or a
   * board `admin`. A soft-deleted comment cannot be edited. An archived board is
   * read-only. Idempotent: an unchanged body returns `{ ..., changed: false }`
   * without writing activity or bumping `version`; otherwise sets `edited_at`,
   * writes a `comment.updated` activity event and bumps `boards.version`.
   */
  update: cardProcedure.input(updateCommentInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yorum düzenleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [comment] = await tx
        .select(commentCols)
        .from(comments)
        .where(eq(comments.id, input.commentId))
        .limit(1);
      if (!comment || comment.cardId !== ctx.card.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yorum bulunamadı.' });
      }
      if (comment.deletedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Silinmiş yorum düzenlenemez.' });
      }

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

      const isAuthor = comment.authorId === ctx.session.user.id;
      if (!isAuthor && !canManageBoard(accessFromBoardRole(ctx.card.boardRole))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu yorumu düzenleyemezsiniz.' });
      }

      if (input.body === comment.body) {
        return { ...comment, changed: false as const };
      }

      const [updated] = await tx
        .update(comments)
        .set({ body: input.body, editedAt: new Date() })
        .where(eq(comments.id, comment.id))
        .returning(commentCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        type: 'comment.updated',
        payload: { commentId: comment.id, cardId: ctx.card.id },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Soft-delete a comment. Board `member+` and either the comment's author or a
   * board `admin`. An archived board is read-only. Idempotent: an
   * already-deleted comment returns `{ id, deletedAt, changed: false }` without
   * writing activity or bumping `version`; otherwise sets `deleted_at`, clears
   * `body`, writes a `comment.deleted` activity event and bumps `boards.version`.
   */
  delete: cardProcedure.input(deleteCommentInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yorum silme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [comment] = await tx
        .select({ id: comments.id, cardId: comments.cardId, authorId: comments.authorId, deletedAt: comments.deletedAt })
        .from(comments)
        .where(eq(comments.id, input.commentId))
        .limit(1);
      if (!comment || comment.cardId !== ctx.card.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yorum bulunamadı.' });
      }
      if (comment.deletedAt) {
        return { id: comment.id, deletedAt: comment.deletedAt, changed: false as const };
      }

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

      const isAuthor = comment.authorId === ctx.session.user.id;
      if (!isAuthor && !canManageBoard(accessFromBoardRole(ctx.card.boardRole))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu yorumu silemezsiniz.' });
      }

      const [updated] = await tx
        .update(comments)
        .set({ deletedAt: new Date(), body: '' })
        .where(eq(comments.id, comment.id))
        .returning({ id: comments.id, deletedAt: comments.deletedAt });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        type: 'comment.deleted',
        payload: { commentId: comment.id, cardId: ctx.card.id },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      return { id: updated.id, deletedAt: updated.deletedAt, changed: true as const };
    });
  }),
});
