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
 * Per `docs/domain/05-aktivite-kurallari.md`, label CRUD writes **no activity**
 * (it's low-signal board metadata, like checklist rename) — but it still bumps
 * `boards.version` inside the transaction (the board screen renders label chips,
 * so a stale-snapshot client needs to know). An archived board is read-only:
 * every mutation re-reads `boards.archived_at` inside its transaction.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — label procedure'leri) and
 * `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { asc, eq, sql } from '@pusula/db';
import { boards, labels } from '@pusula/db';
import {
  canEditBoardContent,
  createLabelInput,
  deleteLabelInput,
  updateLabelInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { deleteSearchDocument, syncSearchDocumentsForScope, upsertSearchDocument } from '../lib/search-indexer';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
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

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const [created] = await withLabelConflict(() =>
        tx
          .insert(labels)
          .values({ boardId: ctx.board.id, name: input.name ?? '', color: input.color })
          .returning(labelCols),
      );
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      await upsertSearchDocument(tx, { entityType: 'label', entityId: created.id });

      return created;
    });
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
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin (name veya color).' });
    }
    if (!canEditBoardContent(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Etiket düzenleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

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

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      await syncSearchDocumentsForScope(tx, {
        boardId: ctx.board.id,
        entityTypes: ['card', 'label'],
      });

      return { ...updated, changed: true as const };
    });
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

    return ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const [label] = await tx
        .select({ id: labels.id, boardId: labels.boardId })
        .from(labels)
        .where(eq(labels.id, input.labelId))
        .limit(1);
      if (!label || label.boardId !== ctx.board.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Etiket bulunamadı.' });
      }

      await tx.delete(labels).where(eq(labels.id, label.id));

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id));

      await deleteSearchDocument(tx, { entityType: 'label', entityId: label.id });
      await syncSearchDocumentsForScope(tx, {
        boardId: ctx.board.id,
        entityTypes: ['card'],
      });

      return { id: label.id, deleted: true as const };
    });
  }),
});
