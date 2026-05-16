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
import { asc, eq } from '@pusula/db';
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
import { parseMentions } from '../lib/mention-parser';
import {
  bumpBoardVersionForRealtime,
  insertRealtimeEvent,
  maybeEnqueueRealtimePublishes,
} from '../lib/realtime-publish';
import { deleteSearchDocument, upsertSearchDocument } from '../lib/search-indexer';
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

/**
 * Tiptap doc body'sini düz metin önizlemesine indirger. Faz 6 review fix
 * (W1 DEM-91): mention/comment-reply email template'i `commentPreview`
 * bekliyor; ayrıca DEM-93 review S1'in işaret ettiği gibi realtime
 * envelope'taki `bodyPreview` de JSON.stringify çıktısı yerine okunabilir
 * metin taşımalı. Parser ile aynı root-only-JSON.parse + depth-cap
 * disiplinini uygular (mention-parser.ts K1/K3 fix'iyle simetrik).
 */
function bodyPreview(body: unknown, max = 200): string {
  const MAX_DEPTH = 32;
  const buf: string[] = [];

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (typeof node === 'string') {
      if (depth === 0) {
        const trimmed = node.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(node) as unknown;
            if (parsed && typeof parsed === 'object') {
              visit(parsed, depth + 1);
              return;
            }
          } catch {
            // Düz metin olarak değerlendir.
          }
        }
      }
      buf.push(node);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      buf.push(rec.text);
    }
    if (rec.type === 'mention' && rec.attrs && typeof rec.attrs === 'object') {
      const attrs = rec.attrs as Record<string, unknown>;
      const label = typeof attrs.label === 'string' ? attrs.label : '';
      if (label) buf.push('@' + label);
    }
    if (Array.isArray(rec.content)) {
      const before = buf.length;
      for (const child of rec.content) visit(child, depth + 1);
      // Paragraph/list-item arası boşluk: aksi halde "Birinci paragrafIkinci"
      // şeklinde okunaksız olur.
      if (
        (rec.type === 'paragraph' || rec.type === 'listItem' || rec.type === 'heading') &&
        buf.length > before
      ) {
        buf.push(' ');
      }
    }
  };

  visit(body, 0);
  const flat = buf.join('').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

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

    const notificationEventIds: string[] = [];
    const realtimeEventIds: string[] = [];
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

      // Faz 6 review fix (W1 DEM-91): commentPreview activity payload'ına
      // konur ve notification-rules.buildPayload whitelist'i üzerinden email
      // template'ine kadar uzanır. Daha önce hesaplanır, hem `comment.created`
      // hem `comment.mentioned` activity'lerinde aynı değer kullanılır.
      const commentPreview = bodyPreview(input.body);
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.created',
          payload: { commentId: createdComment.id, cardId: ctx.card.id, commentPreview },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const mentions = await parseMentions(input.body, ctx.card.boardId, { db: tx });
      const mentionedUserIds = mentions.map((mention) => mention.mentionedUserId);

      const seq = await bumpBoardVersionForRealtime(tx, ctx.card.boardId);
      realtimeEventIds.push(
        await insertRealtimeEvent(tx, {
          type: 'comment.created',
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          clientMutationId: ctx.clientMutationId,
          seq,
          data: {
            commentId: createdComment.id,
            authorId: createdComment.authorId,
            bodyPreview: bodyPreview(createdComment.body),
            mentionedUserIds,
            createdAt: createdComment.createdAt.toISOString(),
            comment: createdComment,
          },
        }),
      );

      // Faz 6A (DEM-90) — fan out notification outbox rows for card watchers
      // (the actor is self-skipped by the rule engine).
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'comment.created',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: { commentId: createdComment.id, cardId: ctx.card.id, commentPreview },
      });
      if (dispatched.inserted > 0) notificationEventIds.push(activity.id);

      for (const { mentionedUserId, mentionText } of mentions) {
        const mentionPayload = {
          commentId: createdComment.id,
          mentionedUserId,
          mentionText,
          commentPreview,
        };
        const [mentionActivity] = await tx
          .insert(activityEvents)
          .values({
            workspaceId: ctx.card.workspaceId,
            boardId: ctx.card.boardId,
            cardId: ctx.card.id,
            actorId: ctx.session.user.id,
            type: 'comment.mentioned',
            payload: mentionPayload,
          })
          .returning({ id: activityEvents.id });
        if (!mentionActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        const mentionDispatched = await dispatchNotificationsForActivity(tx, {
          id: mentionActivity.id,
          type: 'comment.mentioned',
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          payload: mentionPayload,
        });
        if (mentionDispatched.inserted > 0) notificationEventIds.push(mentionActivity.id);

        const mentionSeq = await bumpBoardVersionForRealtime(tx, ctx.card.boardId);
        realtimeEventIds.push(
          await insertRealtimeEvent(tx, {
            type: 'comment.mentioned',
            workspaceId: ctx.card.workspaceId,
            boardId: ctx.card.boardId,
            cardId: ctx.card.id,
            actorId: ctx.session.user.id,
            clientMutationId: ctx.clientMutationId,
            seq: mentionSeq,
            data: {
              commentId: createdComment.id,
              mentionedUserId,
              mentionText,
              actorUserId: ctx.session.user.id,
            },
          }),
        );
      }

      await upsertSearchDocument(tx, { entityType: 'comment', entityId: createdComment.id });

      return createdComment;
    });
    for (const eventId of notificationEventIds) maybeEnqueueNotificationPublish(ctx, eventId);
    maybeEnqueueRealtimePublishes(ctx, realtimeEventIds);
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

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
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

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.updated',
          payload: { commentId: comment.id, cardId: ctx.card.id },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — yorum düzenleme kart watcher'larına in-app bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'comment.updated',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: { commentId: comment.id, cardId: ctx.card.id },
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'comment.updated',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          commentId: comment.id,
          bodyPreview: bodyPreview(updated.body),
          editedAt: updated.editedAt?.toISOString() ?? null,
          patch: { body: updated.body, editedAt: updated.editedAt },
        },
      });

      await upsertSearchDocument(tx, { entityType: 'comment', entityId: updated.id });

      return { ...updated, changed: true as const };
    });
    if (notificationEventId) maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublishes(ctx, realtimeEventId ? [realtimeEventId] : []);
    return result;
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

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [comment] = await tx
        .select({
          id: comments.id,
          cardId: comments.cardId,
          authorId: comments.authorId,
          deletedAt: comments.deletedAt,
        })
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

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.deleted',
          payload: { commentId: comment.id, cardId: ctx.card.id },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — yorum silme kart watcher'larına in-app bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'comment.deleted',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: { commentId: comment.id, cardId: ctx.card.id },
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'comment.deleted',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { commentId: comment.id, deletedAt: updated.deletedAt?.toISOString() ?? null },
      });

      await deleteSearchDocument(tx, { entityType: 'comment', entityId: updated.id });

      return { id: updated.id, deletedAt: updated.deletedAt, changed: true as const };
    });
    if (notificationEventId) maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublishes(ctx, realtimeEventId ? [realtimeEventId] : []);
    return result;
  }),
});
