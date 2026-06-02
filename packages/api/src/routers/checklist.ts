/**
 * Checklist router — Phase 2.5A (DEM-50). Nested:
 * `checklist.{create,update,delete}` and
 * `checklist.item.{create,toggle,update,delete,reorder}`. All run on
 * `cardProcedure` (board `viewer+` visibility already enforced) and require
 * board `member+` (`canEditBoardContent`) — the procedure body checks the
 * finer role with `@pusula/domain/permissions`. An archived board is read-only:
 * every mutation re-reads `boards.archived_at` inside its transaction.
 *
 * Each mutation's transaction contains only the domain change + (when applicable)
 * the `activity_events` insert + the `boards.version` bump (Phase 2.5 scope —
 * realtime/notification outbox land in Phase 5/6). Per
 * `docs/domain/05-aktivite-kurallari.md`, only checklist-item *lifecycle*
 * mutations write activity (`checklist.created`, `checklist.item_added`,
 * `checklist.item_checked` / `checklist.item_unchecked`, `checklist.item_removed`);
 * checklist rename/delete and item content-edit/reorder are low-signal "board
 * metadata"-like changes — **no activity**, but they still bump `boards.version`
 * (the board screen renders checklist badges, so a stale-snapshot client needs
 * to know). The Phase-0 `checklist.item_completed` enum value is unused cruft.
 *
 * Positions are LexoRank-like fractional strings (`@pusula/domain/position`):
 * `create` / `item.create` append to the end; `item.reorder` recomputes the
 * `position` from the supplied `beforeItemId` / `afterItemId` neighbours (which
 * must live in the same checklist).
 *
 * Ownership invariants checked on every nested read: a `checklist` belongs to
 * exactly one card (`checklist.cardId === ctx.card.id`), and a `checklist_item`
 * belongs to exactly one checklist (`item.checklistId === input.checklistId`,
 * whose card is `ctx.card.id`) — a mismatch is `NOT_FOUND`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — checklist / checklist.item
 * procedure'leri) and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { and, asc, count, desc, eq, inArray, isNull } from '@pusula/db';
import { activityEvents, boards, checklistItems, checklists, comments } from '@pusula/db';
import type { Database } from '@pusula/db';
import {
  canEditBoardContent,
  createChecklistInput,
  createChecklistItemInput,
  deleteChecklistInput,
  deleteChecklistItemInput,
  firstPosition,
  positionBetween,
  reorderChecklistItemInput,
  toggleChecklistItemInput,
  updateChecklistInput,
  updateChecklistItemInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
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

/** A Drizzle transaction handle for our schema, as passed to `db.transaction(cb)`. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Columns of a full checklist row returned to clients. */
const checklistCols = {
  id: checklists.id,
  cardId: checklists.cardId,
  title: checklists.title,
  position: checklists.position,
  createdAt: checklists.createdAt,
  updatedAt: checklists.updatedAt,
} as const;

/** Columns of a full checklist-item row returned to clients. */
const itemCols = {
  id: checklistItems.id,
  checklistId: checklistItems.checklistId,
  content: checklistItems.content,
  position: checklistItems.position,
  completed: checklistItems.completed,
  completedAt: checklistItems.completedAt,
  completedBy: checklistItems.completedBy,
  createdAt: checklistItems.createdAt,
  updatedAt: checklistItems.updatedAt,
} as const;

/** Re-read the card's board inside a transaction; throw if missing or archived. */
async function assertBoardWritable(tx: Transaction, boardId: string): Promise<void> {
  const [board] = await tx
    .select({ archivedAt: boards.archivedAt })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!board) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
  }
  assertNotArchived('board', board);
}

/** Load a checklist and assert it belongs to `cardId`; `NOT_FOUND` otherwise. */
async function loadChecklist(tx: Transaction, checklistId: string, cardId: string) {
  const [checklist] = await tx
    .select(checklistCols)
    .from(checklists)
    .where(eq(checklists.id, checklistId))
    .limit(1);
  if (!checklist || checklist.cardId !== cardId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist bulunamadı.' });
  }
  return checklist;
}

/**
 * Load a checklist item and assert it belongs to `checklistId`, whose card is
 * `cardId`; `NOT_FOUND` otherwise. Returns the item row.
 */
async function loadItem(tx: Transaction, itemId: string, checklistId: string, cardId: string) {
  const [item] = await tx
    .select(itemCols)
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  if (!item || item.checklistId !== checklistId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist öğesi bulunamadı.' });
  }
  // Walk up: the checklist must belong to this card.
  await loadChecklist(tx, checklistId, cardId);
  return item;
}

/** Next append position for a sequence ordered by `position` desc; `firstPosition()` when empty. */
function nextPosition(lastPosition: string | undefined): string {
  return lastPosition ? positionBetween(lastPosition, null) : firstPosition();
}

/** Bump the board's optimistic-concurrency `version` column. */
async function bumpBoardVersion(tx: Transaction, boardId: string): Promise<number> {
  return bumpBoardVersionForRealtime(tx, boardId);
}

const itemRouter = router({
  /**
   * Append an item to a checklist. Board `member+` only. Writes a
   * `checklist.item_added` activity event and bumps `boards.version`.
   */
  create: cardProcedure.input(createChecklistItemInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist öğesi ekleme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      await loadChecklist(tx, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      const [last] = await tx
        .select({ position: checklistItems.position })
        .from(checklistItems)
        .where(eq(checklistItems.checklistId, input.checklistId))
        .orderBy(desc(checklistItems.position))
        .limit(1);
      const position = nextPosition(last?.position);

      const [created] = await tx
        .insert(checklistItems)
        .values({ checklistId: input.checklistId, content: input.content, position })
        .returning(itemCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const itemAddedPayload = {
        checklistId: input.checklistId,
        itemId: created.id,
        cardId: ctx.card.id,
        content: created.content,
      };
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'checklist.item_added',
          payload: itemAddedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — madde ekleme kart watcher'larına in-app bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'checklist.item_added',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: itemAddedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.item_added',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          itemId: created.id,
          checklistId: input.checklistId,
          content: created.content,
          position: created.position,
          item: created,
        },
      });
      return created;
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Check / uncheck a checklist item. Board `member+` only. Idempotent: a no-op
   * flip returns `{ ..., changed: false }`. On a real change sets/clears
   * `completed_at` / `completed_by` and writes a `checklist.item_checked` /
   * `checklist.item_unchecked` activity event; bumps `boards.version`.
   */
  toggle: cardProcedure.input(toggleChecklistItemInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist öğesi yetkiniz yok.' });
    }

    let notificationEventId: string | undefined;
    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const item = await loadItem(tx, input.itemId, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      if (item.completed === input.completed) {
        return { ...item, changed: false as const };
      }

      const now = new Date();
      const [updated] = await tx
        .update(checklistItems)
        .set({
          completed: input.completed,
          completedAt: input.completed ? now : null,
          completedBy: input.completed ? ctx.session.user.id : null,
        })
        .where(eq(checklistItems.id, item.id))
        .returning(itemCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const togglePayload = {
        checklistId: input.checklistId,
        itemId: item.id,
        cardId: ctx.card.id,
      };
      const toggleType = input.completed ? 'checklist.item_checked' : 'checklist.item_unchecked';
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: toggleType,
          payload: togglePayload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.item_toggled',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          itemId: item.id,
          checklistId: input.checklistId,
          completed: updated.completed,
          completedBy: updated.completedBy,
          patch: {
            completed: updated.completed,
            completedAt: updated.completedAt,
            completedBy: updated.completedBy,
          },
        },
      });

      // DEM-153 — hem işaretleme hem geri alma kart watcher'larına bildirim
      // üretir. `mapEventToNotificationType` `checklist.item_checked` ve
      // `checklist.item_unchecked`'i tek `checklist_item_completed` tipine
      // bağlar; `payload.activityType` UI'da checked/unchecked'i ayırır.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: toggleType,
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: togglePayload,
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      return { ...updated, changed: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Edit a checklist item's content. Board `member+` only. Idempotent. **No
   * activity** (low-signal board metadata); bumps `boards.version`.
   */
  update: cardProcedure.input(updateChecklistItemInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Checklist öğesi düzenleme yetkiniz yok.',
      });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const item = await loadItem(tx, input.itemId, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      if (input.content === item.content) {
        return { ...item, changed: false as const };
      }

      const [updated] = await tx
        .update(checklistItems)
        .set({ content: input.content })
        .where(eq(checklistItems.id, item.id))
        .returning(itemCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.item_updated',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          itemId: item.id,
          checklistId: input.checklistId,
          content: updated.content,
          patch: { content: updated.content },
        },
      });
      return { ...updated, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Delete a checklist item. Board `member+` only. Idempotent semantics are
   * unnecessary (a missing item is `NOT_FOUND`). Writes a
   * `checklist.item_removed` activity event; bumps `boards.version`.
   */
  delete: cardProcedure.input(deleteChecklistItemInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist öğesi silme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const item = await loadItem(tx, input.itemId, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      await tx.delete(checklistItems).where(eq(checklistItems.id, item.id));

      const itemRemovedPayload = {
        checklistId: input.checklistId,
        itemId: item.id,
        cardId: ctx.card.id,
      };
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'checklist.item_removed',
          payload: itemRemovedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — madde silme kart watcher'larına in-app bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'checklist.item_removed',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: itemRemovedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.item_deleted',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { itemId: item.id, checklistId: input.checklistId },
      });
      return { id: item.id, deleted: true as const };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Move an item within its checklist. Board `member+` only. `beforeItemId` /
   * `afterItemId` are the target neighbours — neither may be the item itself and
   * both must live in the same checklist (a `BAD_REQUEST` otherwise); the new
   * `position` is `positionBetween(before?.position ?? null, after?.position ??
   * null)` (out-of-order neighbours → `BAD_REQUEST`, never a 500). **No
   * activity**; bumps `boards.version`.
   */
  reorder: cardProcedure.input(reorderChecklistItemInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist öğesi taşıma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const item = await loadItem(tx, input.itemId, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      // An item cannot be positioned relative to itself (degenerate / no-op).
      if (input.beforeItemId === input.itemId || input.afterItemId === input.itemId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bir öğe kendisine göre konumlandırılamaz.',
        });
      }

      const neighbourIds = [input.beforeItemId, input.afterItemId].filter(
        (id): id is string => typeof id === 'string',
      );
      const neighbours = neighbourIds.length
        ? await tx
            .select(itemCols)
            .from(checklistItems)
            .where(inArray(checklistItems.id, neighbourIds))
        : [];
      const byId = new Map(neighbours.map((n) => [n.id, n] as const));

      const before = input.beforeItemId ? byId.get(input.beforeItemId) : undefined;
      const after = input.afterItemId ? byId.get(input.afterItemId) : undefined;
      if (
        (input.beforeItemId && (!before || before.checklistId !== input.checklistId)) ||
        (input.afterItemId && (!after || after.checklistId !== input.checklistId))
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Komşu öğeler aynı checklist içinde olmalı.',
        });
      }

      // `fractional-indexing` throws when the neighbours are out of order
      // (before >= after); surface that as a client error, not a 500.
      let position: string;
      try {
        position = positionBetween(before?.position ?? null, after?.position ?? null);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz konum.' });
      }
      const [updated] = await tx
        .update(checklistItems)
        .set({ position })
        .where(eq(checklistItems.id, item.id))
        .returning(itemCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await bumpBoardVersion(tx, ctx.card.boardId);
      return { ...updated, changed: true as const };
    });
  }),
});

export const checklistRouter = router({
  /**
   * List a card's checklists, each with its items, all in `position` order.
   * Board `viewer+` (already enforced by `cardProcedure`). Two reads (checklists
   * for the card, then items for those checklists) — no transaction (read-only).
   * Returns `[{ id, cardId, title, position, items: [{ id, checklistId, content,
   * position, completed, completedAt, completedBy }] }]`.
   */
  list: cardProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select(checklistCols)
      .from(checklists)
      .where(eq(checklists.cardId, ctx.card.id))
      .orderBy(asc(checklists.position));

    const checklistIds = rows.map((r) => r.id);
    const itemRows = checklistIds.length
      ? await ctx.db
          .select(itemCols)
          .from(checklistItems)
          .where(inArray(checklistItems.checklistId, checklistIds))
          .orderBy(asc(checklistItems.position))
      : [];

    // Madde başına (silinmemiş) yorum sayısı — inline thread rozeti bundan
    // okur. Tek gruplu sorgu; `checklist_item_id IS NOT NULL` partial index'i
    // kullanır. Soft-delete edilmiş yorumlar sayılmaz.
    const itemIds = itemRows.map((i) => i.id);
    const countRows = itemIds.length
      ? await ctx.db
          .select({ checklistItemId: comments.checklistItemId, count: count() })
          .from(comments)
          .where(and(inArray(comments.checklistItemId, itemIds), isNull(comments.deletedAt)))
          .groupBy(comments.checklistItemId)
      : [];
    const commentCountByItem = new Map<string, number>();
    for (const row of countRows) {
      if (row.checklistItemId) commentCountByItem.set(row.checklistItemId, Number(row.count));
    }

    const itemsByChecklist = new Map<string, Array<(typeof itemRows)[number] & { commentCount: number }>>();
    for (const item of itemRows) {
      const withCount = { ...item, commentCount: commentCountByItem.get(item.id) ?? 0 };
      const bucket = itemsByChecklist.get(item.checklistId);
      if (bucket) bucket.push(withCount);
      else itemsByChecklist.set(item.checklistId, [withCount]);
    }

    return rows.map((checklist) => ({
      ...checklist,
      items: itemsByChecklist.get(checklist.id) ?? [],
    }));
  }),

  /**
   * Append a checklist to a card. Board `member+` only. Writes a
   * `checklist.created` activity event and bumps `boards.version`.
   */
  create: cardProcedure.input(createChecklistInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist oluşturma yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      await assertBoardWritable(tx, ctx.card.boardId);

      const [last] = await tx
        .select({ position: checklists.position })
        .from(checklists)
        .where(eq(checklists.cardId, ctx.card.id))
        .orderBy(desc(checklists.position))
        .limit(1);
      const position = nextPosition(last?.position);

      const [created] = await tx
        .insert(checklists)
        .values({ cardId: ctx.card.id, title: input.title, position })
        .returning(checklistCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const checklistCreatedPayload = {
        checklistId: created.id,
        cardId: ctx.card.id,
        title: created.title,
      };
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.card.workspaceId,
          boardId: ctx.card.boardId,
          cardId: ctx.card.id,
          actorId: ctx.session.user.id,
          type: 'checklist.created',
          payload: checklistCreatedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — yapılacaklar listesi ekleme kart watcher'larına bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'checklist.created',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        payload: checklistCreatedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.created',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          checklistId: created.id,
          cardId: ctx.card.id,
          title: created.title,
          position: created.position,
          checklist: { ...created, items: [] },
        },
      });
      return created;
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Rename a checklist. Board `member+` only. Idempotent. **No activity**
   * (low-signal board metadata); bumps `boards.version`.
   */
  update: cardProcedure.input(updateChecklistInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist düzenleme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const checklist = await loadChecklist(tx, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      if (input.title === checklist.title) {
        return { ...checklist, changed: false as const };
      }

      const [updated] = await tx
        .update(checklists)
        .set({ title: input.title })
        .where(eq(checklists.id, checklist.id))
        .returning(checklistCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.updated',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          checklistId: checklist.id,
          title: updated.title,
          patch: { title: updated.title },
        },
      });
      return { ...updated, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  /**
   * Delete a checklist (its items cascade via the FK). Board `member+` only.
   * A missing checklist is `NOT_FOUND`. **No activity**; bumps `boards.version`.
   */
  delete: cardProcedure.input(deleteChecklistInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Checklist silme yetkiniz yok.' });
    }

    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const checklist = await loadChecklist(tx, input.checklistId, ctx.card.id);
      await assertBoardWritable(tx, ctx.card.boardId);

      await tx.delete(checklists).where(eq(checklists.id, checklist.id));

      const seq = await bumpBoardVersion(tx, ctx.card.boardId);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'checklist.deleted',
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { checklistId: checklist.id },
      });
      return { id: checklist.id, deleted: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    return result;
  }),

  item: itemRouter,
});
