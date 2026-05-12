/**
 * Card-labels router — Phase 2.5B (DEM-51). Nested under `card.labels.*`:
 * `card.labels.{list,add,remove}`. All run on `cardProcedure` (board `viewer+`
 * visibility already enforced) — the procedure body adds the finer role check
 * with `@pusula/domain/permissions`:
 * - `list`   — board `viewer+` (the procedure already guarantees it).
 * - `add`    — board `member+` (`canEditBoardContent`).
 * - `remove` — board `member+` (`canEditBoardContent`).
 *
 * Labels are board-scoped (`docs/domain/01-urun-modeli.md` invariant 13): the
 * label being attached must belong to the *card's* board (else `BAD_REQUEST`);
 * a missing label is `NOT_FOUND`.
 *
 * Each mutation's transaction contains only the domain change + (when applicable)
 * the `activity_events` insert + the `boards.version` bump (Phase 2.5 scope —
 * realtime/notification outbox land in Phase 5/6). An archived board is
 * read-only: every mutation re-reads `boards.archived_at` inside its
 * transaction. Mutations are idempotent: re-adding a label already on the card,
 * or removing one that isn't there, returns `{ ..., changed: false }` without
 * writing activity or bumping `version`.
 *
 * Activity taxonomy (per `docs/domain/05-aktivite-kurallari.md`): `add` →
 * `card.label_added`, `remove` → `card.label_removed` — payload
 * `{ cardId, labelId }`.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — card.labels procedure'leri)
 * and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { and, eq, sql } from '@pusula/db';
import { activityEvents, boards, cardLabels, labels } from '@pusula/db';
import {
  addCardLabelInput,
  canEditBoardContent,
  removeCardLabelInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
import { router } from '../trpc';

export const cardLabelsRouter = router({
  /**
   * List the labels attached to a card (joined with the `labels` row for the
   * name + colour). Board `viewer+` (already enforced by `cardProcedure`). No
   * transaction (read-only).
   */
  list: cardProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ labelId: cardLabels.labelId, name: labels.name, color: labels.color })
      .from(cardLabels)
      .innerJoin(labels, eq(labels.id, cardLabels.labelId))
      .where(eq(cardLabels.cardId, ctx.card.id));
  }),

  /**
   * Attach a label to a card. Board `member+` only. The label must exist and
   * belong to the card's board. An archived board is read-only. Idempotent:
   * re-adding a label already on the card returns `{ ..., changed: false }`
   * without writing activity or bumping `version`; otherwise writes a
   * `card.label_added` activity event and bumps `boards.version`.
   */
  add: cardProcedure.input(addCardLabelInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Karta etiket ekleme yetkiniz yok.' });
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

      const [label] = await tx
        .select({ id: labels.id, boardId: labels.boardId })
        .from(labels)
        .where(eq(labels.id, input.labelId))
        .limit(1);
      if (!label) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Etiket bulunamadı.' });
      }
      if (label.boardId !== ctx.card.boardId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Etiket bu board'a ait değil." });
      }

      const inserted = await tx
        .insert(cardLabels)
        .values({ cardId: ctx.card.id, labelId: input.labelId })
        .onConflictDoNothing()
        .returning({ cardId: cardLabels.cardId });
      if (inserted.length === 0) {
        return { cardId: ctx.card.id, labelId: input.labelId, changed: false as const };
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        type: 'card.label_added',
        payload: { cardId: ctx.card.id, labelId: input.labelId },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      return { cardId: ctx.card.id, labelId: input.labelId, changed: true as const };
    });
  }),

  /**
   * Detach a label from a card. Board `member+` only. An archived board is
   * read-only. Idempotent: removing a label that isn't on the card returns
   * `{ ..., changed: false }` without writing activity or bumping `version`;
   * otherwise writes a `card.label_removed` activity event and bumps
   * `boards.version`.
   */
  remove: cardProcedure.input(removeCardLabelInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Karttan etiket çıkarma yetkiniz yok.' });
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
        .delete(cardLabels)
        .where(and(eq(cardLabels.cardId, ctx.card.id), eq(cardLabels.labelId, input.labelId)))
        .returning({ cardId: cardLabels.cardId });
      if (deleted.length === 0) {
        return { cardId: ctx.card.id, labelId: input.labelId, changed: false as const };
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        actorId: ctx.session.user.id,
        type: 'card.label_removed',
        payload: { cardId: ctx.card.id, labelId: input.labelId },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.card.boardId));

      return { cardId: ctx.card.id, labelId: input.labelId, changed: true as const };
    });
  }),
});
