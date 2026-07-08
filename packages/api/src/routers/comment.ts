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
import { and, asc, eq, isNull } from '@pusula/db';
import { activityEvents, boards, checklistItems, checklists, comments } from '@pusula/db';
import type { Database } from '@pusula/db';
import {
  canEditBoardContent,
  canManageBoard,
  createCommentInput,
  deleteCommentInput,
  listCommentsInput,
  truncateForAudit,
  updateCommentInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import { parseMentions } from '../lib/mention-parser';
import { richTextPreview } from '../lib/rich-text-preview';
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
  checklistItemId: comments.checklistItemId,
  authorId: comments.authorId,
  body: comments.body,
  editedAt: comments.editedAt,
  deletedAt: comments.deletedAt,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
} as const;

/** A Drizzle transaction handle for our schema, as passed to `db.transaction(cb)`. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Assert that `checklistItemId` is a checklist item belonging to a checklist on
 * `cardId`; `NOT_FOUND` otherwise. Walks item → checklist → card so a
 * cross-card item id is rejected (the comment's `cardId` is always the card the
 * procedure is scoped to). Returns nothing — callers only need the guard.
 */
async function assertChecklistItemOnCard(
  tx: Transaction,
  checklistItemId: string,
  cardId: string,
): Promise<void> {
  const [row] = await tx
    .select({ cardId: checklists.cardId })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklistItems.checklistId, checklists.id))
    .where(eq(checklistItems.id, checklistItemId))
    .limit(1);
  if (!row || row.cardId !== cardId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist öğesi bulunamadı.' });
  }
}

// `bodyPreview` → `richTextPreview` (`../lib/rich-text-preview`) olarak taşındı;
// comment gövdesi + checklist maddesi içeriği aynı düz-metin indirgemeyi paylaşır.

export const commentRouter = router({
  /**
   * List a card's comments in ascending `created_at` order. Board `viewer+`
   * (already enforced by `cardProcedure`). Includes soft-deleted rows (their
   * `body` is empty) so the client can render a "deleted" placeholder in place.
   * No transaction (read-only).
   *
   * `checklistItemId` omitted → kart-seviyesi thread (`checklist_item_id IS
   * NULL`); set → o maddenin thread'i. Böylece kart yorum bölümü madde
   * yorumlarını karıştırmaz ve her madde kendi thread'ini ayrı çeker.
   */
  list: cardProcedure.input(listCommentsInput).query(async ({ ctx, input }) => {
    return ctx.db
      .select(commentCols)
      .from(comments)
      .where(
        and(
          eq(comments.cardId, ctx.card.id),
          input.checklistItemId
            ? eq(comments.checklistItemId, input.checklistItemId)
            : isNull(comments.checklistItemId),
        ),
      )
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
      assertNotArchived('board', board, "Arşivli board'a yorum eklenemez.");

      // Madde thread'i ise hedef maddenin gerçekten bu kartın bir checklist'ine
      // ait olduğunu doğrula (cross-card madde id'si reddedilir).
      if (input.checklistItemId) {
        await assertChecklistItemOnCard(tx, input.checklistItemId, ctx.card.id);
      }

      const [createdComment] = await tx
        .insert(comments)
        .values({
          cardId: ctx.card.id,
          checklistItemId: input.checklistItemId ?? null,
          authorId: ctx.session.user.id,
          body: input.body,
        })
        .returning(commentCols);
      if (!createdComment) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Madde thread'inde `checklistItemId` activity payload'a + (aşağıda)
      // realtime data'ya taşınır; kart yorumunda alan hiç eklenmez. Null'u
      // realtime şemasına (`z.string().min(1)`) sokmamak için koşullu yayıyoruz.
      const itemTarget = input.checklistItemId ? { checklistItemId: input.checklistItemId } : {};

      // Faz 6 review fix (W1 DEM-91): commentPreview activity payload'ına
      // konur ve notification-rules.buildPayload whitelist'i üzerinden email
      // template'ine kadar uzanır. Daha önce hesaplanır, hem `comment.created`
      // hem `comment.mentioned` activity'lerinde aynı değer kullanılır.
      const commentPreview = richTextPreview(input.body);
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.created',
          payload: { commentId: createdComment.id, cardId: ctx.card.id, commentPreview, ...itemTarget },
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
            bodyPreview: richTextPreview(createdComment.body),
            mentionedUserIds,
            createdAt: createdComment.createdAt.toISOString(),
            comment: createdComment,
            ...itemTarget,
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
        payload: { commentId: createdComment.id, cardId: ctx.card.id, commentPreview, ...itemTarget },
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
      assertNotArchived('board', board);

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

      // Bildirim detay / audit (2026-06-20) — before/after yorum gövdesi ≤2KB
      // kırpılarak payload'a gömülür (Tiptap JSON ham string olarak; parse yok,
      // yalnız uzunluk sınırı + `truncated:true`). Eski değer `comment.body`
      // (update öncesi), yeni değer `updated.body`.
      const fromBody = truncateForAudit(comment.body);
      const toBody = truncateForAudit(updated.body);
      const updatePayload = {
        commentId: comment.id,
        cardId: ctx.card.id,
        ...(fromBody ? { fromBody } : {}),
        ...(toBody ? { toBody } : {}),
      };
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.updated',
          payload: updatePayload,
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
        payload: updatePayload,
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
          bodyPreview: richTextPreview(updated.body),
          editedAt: updated.editedAt?.toISOString() ?? null,
          patch: { body: updated.body, editedAt: updated.editedAt },
          // Madde thread'i ise dispatcher cache patch'ini o maddenin
          // `comment.list({ cardId, checklistItemId })` query'sine yöneltir.
          ...(comment.checklistItemId ? { checklistItemId: comment.checklistItemId } : {}),
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
          checklistItemId: comments.checklistItemId,
          authorId: comments.authorId,
          deletedAt: comments.deletedAt,
          // Bildirim detay / audit (2026-06-20) — silinmeden ÖNCE gövdeyi oku;
          // update `body=''` ile temizliyor, sonra okumak boş döner.
          body: comments.body,
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
      assertNotArchived('board', board);

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

      // Bildirim detay / audit (2026-06-20) — silinen yorumun gövdesi ≤2KB
      // kırpılarak payload'a gömülür (Tiptap JSON ham string; parse yok).
      const deletedBody = truncateForAudit(comment.body);
      const deletePayload = {
        commentId: comment.id,
        cardId: ctx.card.id,
        ...(deletedBody ? { deletedBody } : {}),
      };
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'comment.deleted',
          payload: deletePayload,
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
        payload: deletePayload,
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
        data: {
          commentId: comment.id,
          deletedAt: updated.deletedAt?.toISOString() ?? null,
          ...(comment.checklistItemId ? { checklistItemId: comment.checklistItemId } : {}),
        },
      });

      await deleteSearchDocument(tx, { entityType: 'comment', entityId: updated.id });

      return { id: updated.id, deletedAt: updated.deletedAt, changed: true as const };
    });
    if (notificationEventId) maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublishes(ctx, realtimeEventId ? [realtimeEventId] : []);
    return result;
  }),
});
