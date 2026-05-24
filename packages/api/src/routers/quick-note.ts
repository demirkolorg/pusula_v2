/**
 * Quick-note router — DEM-203 (mobil "Hızlı Not").
 *
 * A Hızlı Not is a personal capture entity: it belongs to exactly one user and
 * lives outside the workspace/board/list hierarchy. Every procedure runs on
 * `protectedProcedure`; `list/create/update/delete` need no workspace/board
 * middleware (the entity has no board) but every row mutation re-checks
 * ownership — `note.userId !== session.user.id` is reported as `NOT_FOUND` so a
 * note's existence is never leaked across users.
 *
 * `list/create/update/delete` write no `activity_events` / `realtime_events` /
 * `notification_outbox` rows — a quick note is private. `convertToCard` is the
 * one exception: in a single transaction it creates a card (the note's
 * `content` becomes the card title — identical side effects to `card.create`
 * via `createCardInTransaction`) and then deletes the note silently.
 *
 * See `docs/architecture/03-backend.md` (`quickNote` router) and
 * `docs/architecture/04-veri-katmani.md` (DEM-203 kapsamı).
 */
import { and, desc, eq, lists, quickNotes } from '@pusula/db';
import {
  canEditBoardContent,
  convertQuickNoteToCardInput,
  createQuickNoteInput,
  deleteQuickNoteInput,
  updateQuickNoteInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { assertNotArchived } from '../lib/archive-guard';
import { createCardInTransaction } from '../lib/card-create';
import { maybeEnqueueRealtimePublish } from '../lib/realtime-publish';
import { accessFromBoardRole } from '../middleware/board';
import { resolveBoardAccess } from '../middleware/board-access';
import { protectedProcedure, router } from '../trpc';

/** Columns of a quick-note row returned to clients. */
const quickNoteCols = {
  id: quickNotes.id,
  content: quickNotes.content,
  createdAt: quickNotes.createdAt,
  updatedAt: quickNotes.updatedAt,
} as const;

export const quickNoteRouter = router({
  /**
   * List the caller's own quick notes, newest first. Read-only, no transaction.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select(quickNoteCols)
      .from(quickNotes)
      .where(eq(quickNotes.userId, ctx.session.user.id))
      .orderBy(desc(quickNotes.createdAt));
  }),

  /**
   * Create a quick note owned by the session user. Single-row insert — no
   * activity / realtime / notification rows.
   */
  create: protectedProcedure.input(createQuickNoteInput).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(quickNotes)
      .values({ userId: ctx.session.user.id, content: input.content })
      .returning(quickNoteCols);
    if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    return created;
  }),

  /**
   * Edit a quick note's body. Ownership is enforced inside the `WHERE` clause:
   * an update that matches no row (missing note *or* not the caller's) is
   * reported as `NOT_FOUND` so a note's existence is never leaked.
   */
  update: protectedProcedure.input(updateQuickNoteInput).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(quickNotes)
      .set({ content: input.content })
      .where(and(eq(quickNotes.id, input.noteId), eq(quickNotes.userId, ctx.session.user.id)))
      .returning(quickNoteCols);
    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Hızlı not bulunamadı.' });
    }
    return updated;
  }),

  /**
   * Delete a quick note. Idempotent — a missing note (or one owned by another
   * user) is a silent no-op; the ownership-scoped `WHERE` doubles as the
   * not-found guard. No activity / realtime / notification rows.
   */
  delete: protectedProcedure.input(deleteQuickNoteInput).mutation(async ({ ctx, input }) => {
    await ctx.db
      .delete(quickNotes)
      .where(and(eq(quickNotes.id, input.noteId), eq(quickNotes.userId, ctx.session.user.id)));
    return { success: true };
  }),

  /**
   * Convert a quick note into a card in `listId`. With no placement neighbours
   * the card is appended to the list end (the mobile flow); with
   * `before`/`afterCardId` it lands at the resolved position (DEM-205 — web
   * "Hızlı Notlar" panel drag-to-list). Flow, all in one
   * transaction: (1) delete the note ownership-scoped with `RETURNING` — the
   * `DELETE` takes a row lock, so a concurrent second call sees 0 rows and gets
   * `NOT_FOUND`, closing both the TOCTOU race and the "one note → one card"
   * double-delivery; (2) resolve the target list's board + require board
   * `member+` (`canEditBoardContent`), reject an archived board / list (a
   * failure here rolls back the transaction, undoing the note deletion);
   * (3) create the card (deleted note's `content` → card title, same side
   * effects as `card.create`). Returns the created card (the mobile client
   * navigates to it).
   */
  convertToCard: protectedProcedure
    .input(convertQuickNoteToCardInput)
    .mutation(async ({ ctx, input }) => {
      let realtimeEventId: string | undefined;
      const card = await ctx.db.transaction(async (tx) => {
        // (1) Delete the note first, ownership-scoped. The `DELETE` row lock
        // makes this the idempotency gate: a concurrent second call sees 0
        // deleted rows and gets `NOT_FOUND`. The deleted note's `content`
        // (returned here) becomes the card title.
        const [note] = await tx
          .delete(quickNotes)
          .where(and(eq(quickNotes.id, input.noteId), eq(quickNotes.userId, ctx.session.user.id)))
          .returning({ id: quickNotes.id, content: quickNotes.content });
        if (!note) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Hızlı not bulunamadı.' });
        }

        // (2) Resolve the target list + its board, then check board `member+`.
        // Any failure here rolls back the transaction — the note deletion is
        // undone (atomic — acceptable).
        const [list] = await tx
          .select({ id: lists.id, boardId: lists.boardId, archivedAt: lists.archivedAt })
          .from(lists)
          .where(eq(lists.id, input.listId))
          .limit(1);
        if (!list) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Liste bulunamadı.' });
        }

        const board = await resolveBoardAccess(tx, list.boardId, ctx.session.user.id);
        if (!canEditBoardContent(accessFromBoardRole(board.role))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Kart oluşturma yetkiniz yok.' });
        }
        assertNotArchived('board', board, "Arşivli board'a kart eklenemez.");
        assertNotArchived('list', list, 'Arşivli listeye kart eklenemez.');

        // (3) Create the card (same side effects as `card.create`). Placement
        // is forwarded as-is: with no neighbours the card is appended to the
        // list end (the mobile flow); with `before`/`afterCardId` it lands at
        // the resolved position (DEM-205 — web panel drag-to-list). The
        // neighbours are validated against `list.id` inside `createCardInTransaction`.
        const result = await createCardInTransaction(tx, {
          list: { id: list.id, boardId: list.boardId },
          board: { workspaceId: board.workspaceId },
          title: note.content,
          actorId: ctx.session.user.id,
          clientMutationId: ctx.clientMutationId,
          placement: {
            beforeCardId: input.beforeCardId ?? null,
            afterCardId: input.afterCardId ?? null,
            newPosition: input.newPosition,
          },
        });
        realtimeEventId = result.realtimeEventId;

        return result.card;
      });
      maybeEnqueueRealtimePublish(ctx, realtimeEventId);
      return card;
    }),
});
