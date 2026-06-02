/**
 * Label router — Phase 2.5B (DEM-51). Board-scoped: `label.{list,create,update,
 * delete}`. All run on `boardProcedure` (input carries `boardId`; board `viewer+`
 * visibility already enforced) — the procedure body adds the finer role check
 * with `@pusula/domain/permissions`:
 * - `list`   — board `viewer+` (the procedure already guarantees it).
 * - `create` / `update` / `delete` — board `member+` (`canEditBoardContent`).
 *
 * Labels are board-scoped (`docs/domain/01-urun-modeli.md` invariant 13). The
 * `(boardId, color, name)` uniqueness lives at the DB level (a `uniqueIndex`);
 * the pre-check is skipped — we let the insert/update hit the constraint and
 * translate the Postgres `23505` into a `CONFLICT` (the only user-input-driven
 * unique constraint on `labels`).
 *
 * Bildirim kapsamı genişletme (Faz 2 — granular tipler, 2026-06-03): label CRUD
 * artık `label.created` / `label.updated` / `label.deleted` activity event'leri
 * yazar. Eskiden "low-signal board metadata" sayılıp hiç activity üretmiyordu;
 * granular bildirim tipleri (`label_created` / `label_updated` / `label_deleted`)
 * board audience'a düştüğü için her olay kendi activity'sini üretip
 * `dispatchNotificationsForActivity` ile bildirim fan-out'unu tetikler. Activity
 * + `boards.version` bump (board ekranı etiket çiplerini render eder; stale
 * snapshot client'ı haberdar olmalı) aynı transaction'da. An archived board is
 * read-only: every mutation re-reads `boards.archived_at` inside its transaction.
 * Detay → `docs/domain/05-aktivite-kurallari.md` + `docs/domain/04-bildirim-kurallari.md`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — label procedure'leri) and
 * `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { asc, eq } from '@pusula/db';
import { activityEvents, boards, labels } from '@pusula/db';
import {
  canEditBoardContent,
  createLabelInput,
  deleteLabelInput,
  updateLabelInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import {
  deleteSearchDocument,
  syncSearchDocumentsForScope,
  upsertSearchDocument,
} from '../lib/search-indexer';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import {
  bumpBoardVersionForRealtime,
  insertRealtimeEvent,
  maybeEnqueueRealtimePublish,
} from '../lib/realtime-publish';
import { router } from '../trpc';

/** Columns of a full label row returned to clients. */
const labelCols = {
  id: labels.id,
  boardId: labels.boardId,
  name: labels.name,
  color: labels.color,
} as const;

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
 * Runs `fn`, translating a Postgres unique-constraint violation into a
 * `CONFLICT`. The only user-input-driven unique constraint on `labels` is the
 * `(boardId, color, name)` index, so a `23505` from a label insert/update means
 * that colour + name pair is already taken on this board.
 */
async function withLabelConflict<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Bu renk + ad ile etiket zaten var.' });
    }
    throw err;
  }
}

export const labelRouter = router({
  /**
   * List a board's labels, ordered deterministically by name then colour. Board
   * `viewer+` (already enforced by `boardProcedure`). No transaction (read-only).
   */
  list: boardProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.boardId, ctx.board.id))
      .orderBy(asc(labels.name), asc(labels.color));
  }),

  /**
   * Create a board label. Board `member+` only. `name` is optional (a
   * colour-only label is valid). An archived board is read-only. A
   * `(boardId, color, name)` clash is a `CONFLICT`. **No activity**; bumps
   * `boards.version`.
   */
  create: boardProcedure.input(createLabelInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Etiket oluşturma yetkiniz yok.' });
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

      const [created] = await withLabelConflict(() =>
        tx
          .insert(labels)
          .values({ boardId: ctx.board.id, name: input.name ?? '', color: input.color })
          .returning(labelCols),
      );
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Bildirim kapsamı genişletme (Faz 2) — etiket oluşturma `label.created`
      // activity'si yazar + board audience'a `label_created` bildirimi üretir.
      const labelCreatedPayload = {
        labelId: created.id,
        name: created.name,
        color: created.color,
        clientMutationId: ctx.clientMutationId,
      };
      const [labelCreatedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'label.created',
          payload: labelCreatedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!labelCreatedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: labelCreatedActivity.id,
        type: 'label.created',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: labelCreatedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = labelCreatedActivity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.label_created',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          labelId: created.id,
          name: created.name,
          color: created.color,
          label: { id: created.id, name: created.name, color: created.color },
        },
      });

      await upsertSearchDocument(tx, { entityType: 'label', entityId: created.id });

      return created;
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Update a board label's name and/or colour. Board `member+` only. At least
   * one of `name` / `color` must be present. An archived board is read-only.
   * Idempotent: a no-op patch returns `{ ..., changed: false }` without bumping
   * `version`. A `(boardId, color, name)` clash is a `CONFLICT`. **No activity**;
   * bumps `boards.version` on a real change.
   */
  update: boardProcedure.input(updateLabelInput).mutation(async ({ ctx, input }) => {
    const wantsName = input.name !== undefined;
    const wantsColor = input.color !== undefined;
    if (!wantsName && !wantsColor) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Güncellenecek bir alan belirtin (name veya color).',
      });
    }
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Etiket düzenleme yetkiniz yok.' });
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

      const [label] = await tx
        .select(labelCols)
        .from(labels)
        .where(eq(labels.id, input.labelId))
        .limit(1);
      if (!label || label.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Etiket bulunamadı.' });
      }

      const nextName = wantsName ? input.name : undefined;
      const patch: Partial<typeof labels.$inferInsert> = {};
      if (nextName !== undefined && nextName !== label.name) patch.name = nextName;
      if (wantsColor && input.color !== label.color) patch.color = input.color;

      if (Object.keys(patch).length === 0) {
        return { ...label, changed: false as const };
      }

      const [updated] = await withLabelConflict(() =>
        tx.update(labels).set(patch).where(eq(labels.id, label.id)).returning(labelCols),
      );
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Bildirim kapsamı genişletme (Faz 2) — etiket güncelleme `label.updated`
      // activity'si yazar + board audience'a `label_updated` bildirimi üretir.
      const labelUpdatedPayload = {
        labelId: updated.id,
        name: updated.name,
        color: updated.color,
        clientMutationId: ctx.clientMutationId,
      };
      const [labelUpdatedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'label.updated',
          payload: labelUpdatedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!labelUpdatedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: labelUpdatedActivity.id,
        type: 'label.updated',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: labelUpdatedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = labelUpdatedActivity.id;

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.label_updated',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          labelId: updated.id,
          name: updated.name,
          color: updated.color,
          label: { id: updated.id, name: updated.name, color: updated.color },
        },
      });

      await syncSearchDocumentsForScope(tx, {
        boardId: ctx.board.id,
        entityTypes: ['card', 'label'],
      });

      return { ...updated, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Delete a board label (its `card_labels` links cascade via the FK). Board
   * `member+` only. A missing label is `NOT_FOUND`. An archived board is
   * read-only. **No activity**; bumps `boards.version`.
   */
  delete: boardProcedure.input(deleteLabelInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Etiket silme yetkiniz yok.' });
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

      const [label] = await tx
        // `name` de seçilir: silinen etiketin adı bildirim payload'una taşınır
        // (önizleme — etiket satırı aşağıda silindiği için sonradan okunamaz).
        .select({ id: labels.id, boardId: labels.boardId, name: labels.name })
        .from(labels)
        .where(eq(labels.id, input.labelId))
        .limit(1);
      if (!label || label.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Etiket bulunamadı.' });
      }

      // Bildirim kapsamı genişletme (Faz 2) — etiket silme `label.deleted`
      // activity'si yazar + board audience'a `label_deleted` bildirimi üretir.
      // Activity silmeden ÖNCE yazılır; silinen etiket id'si + adı payload'da.
      const labelDeletedPayload = {
        labelId: label.id,
        name: label.name,
        clientMutationId: ctx.clientMutationId,
      };
      const [labelDeletedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'label.deleted',
          payload: labelDeletedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!labelDeletedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: labelDeletedActivity.id,
        type: 'label.deleted',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: labelDeletedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = labelDeletedActivity.id;

      await tx.delete(labels).where(eq(labels.id, label.id));

      const seq = await bumpBoardVersionForRealtime(tx, ctx.board.id);
      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.label_deleted',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { labelId: label.id },
      });

      await deleteSearchDocument(tx, { entityType: 'label', entityId: label.id });
      await syncSearchDocumentsForScope(tx, {
        boardId: ctx.board.id,
        entityTypes: ['card'],
      });

      return { id: label.id, deleted: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),
});
