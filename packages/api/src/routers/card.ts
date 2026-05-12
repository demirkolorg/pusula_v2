/**
 * Card router — Phase 2C (DEM-36): `card.create` / `card.get` / `card.update` /
 * `card.archive`. `card.move` (within / across lists) + drag-drop land in
 * Phase 3; optimistic UI in Phase 4; realtime publishing in Phase 5;
 * notification outbox in Phase 6.
 *
 * Authorization is server-side:
 * - `card.create` runs on `protectedProcedure` (it only carries `listId`, so it
 *   resolves the list's board itself via `resolveBoardAccess`), then requires
 *   board `member+` (`canEditBoardContent`).
 * - `card.get` runs on `cardProcedure` (board visibility ⇒ `viewer+` already
 *   enforced); the explicit `canViewBoard` check is kept for clarity.
 * - `card.update` / `card.archive` run on `cardProcedure` and require board
 *   `member+` (`canEditBoardContent`).
 *
 * Each mutation's transaction contains only the domain change + the
 * `activity_events` insert(s) + the `boards.version` bump (Phase 2 scope). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası) and `docs/architecture/03-backend.md`.
 *
 * Invariant: a card lives in exactly one list, and `card.boardId === list.boardId`
 * (set at insert time from the list's board). Phase 2 positions only ever
 * *append*: a new card goes to the end of its list. An archived board is
 * read-only (no new cards, no edits); an archived *list* rejects new cards too
 * (the domain forbids adding/moving cards into an archived list) — but its
 * existing cards may still be edited/archived (only `card.move` is blocked).
 *
 * `activity_events` taxonomy (per `docs/architecture/03-backend.md`):
 * `card.create` → `card.created`; `card.update`: title → `card.renamed`,
 * description → `card.description_changed`, `due_at` set → `card.due_set` /
 * cleared → `card.due_cleared`, cover colour set → `card.cover_changed` /
 * cleared → `card.cover_cleared`; `card.archive` → `card.archived`;
 * `card.complete` → `card.completed`; `card.uncomplete` → `card.uncompleted`.
 *
 * Phase 2.7 (DEM-66 / DEM-67): `card.complete` / `card.uncomplete` toggle the
 * `completed` / `completed_at` / `completed_by` columns; `card.update` also
 * accepts `coverColor` (one of the 12 palette names, or `null` to clear).
 */
import { desc, eq, sql } from '@pusula/db';
import { activityEvents, boards, cards, lists, users } from '@pusula/db';
import {
  archiveCardInput,
  canEditBoardContent,
  canViewBoard,
  completeCardInput,
  createCardInput,
  firstPosition,
  positionBetween,
  uncompleteCardInput,
  updateCardInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { accessFromBoardRole } from '../middleware/board';
import { resolveBoardAccess } from '../middleware/board-access';
import { cardProcedure } from '../middleware/card';
import { protectedProcedure, router } from '../trpc';
import { cardLabelsRouter } from './card-labels';
import { cardMembersRouter } from './card-members';

/** Columns of a full card row returned to clients. */
const cardCols = {
  id: cards.id,
  boardId: cards.boardId,
  listId: cards.listId,
  title: cards.title,
  description: cards.description,
  position: cards.position,
  dueAt: cards.dueAt,
  completed: cards.completed,
  completedAt: cards.completedAt,
  completedBy: cards.completedBy,
  coverColor: cards.coverColor,
  archivedAt: cards.archivedAt,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
} as const;

export const cardRouter = router({
  /**
   * Create a card at the end of a list. Board `member+` only. The list's board
   * must be active and the list itself must not be archived. Writes a
   * `card.created` activity event and bumps `boards.version` in the same
   * transaction. `beforeCardId` / `afterCardId` on the input are accepted but
   * ignored in Phase 2 (append-only) — placement lands in Phase 3.
   */
  create: protectedProcedure.input(createCardInput).mutation(async ({ ctx, input }) => {
    return ctx.db.transaction(async (tx) => {
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
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Arşivli board'a kart eklenemez." });
      }
      if (list.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart eklenemez.' });
      }

      // Highest-position card in the list (active *and* archived — positions are
      // a single sequence per list); place the new one right after it.
      const [last] = await tx
        .select({ position: cards.position })
        .from(cards)
        .where(eq(cards.listId, list.id))
        .orderBy(desc(cards.position))
        .limit(1);
      const position = last ? positionBetween(last.position, null) : firstPosition();

      const [created] = await tx
        .insert(cards)
        // `boardId` is the list's board — the card ⊆ list.board invariant.
        .values({ boardId: list.boardId, listId: list.id, title: input.title, position })
        .returning(cardCols);
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: board.workspaceId,
        boardId: list.boardId,
        cardId: created.id,
        actorId: ctx.session.user.id,
        type: 'card.created',
        payload: {
          cardId: created.id,
          listId: list.id,
          title: created.title,
          position: created.position,
        },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, list.boardId));

      return created;
    });
  }),

  /**
   * Read a single card + the caller's `card_members` relationships. Board
   * `viewer+` (already enforced by `cardProcedure`). No transaction (read-only).
   */
  get: cardProcedure.query(async ({ ctx }) => {
    if (!canViewBoard(accessFromBoardRole(ctx.card.boardRole))) {
      // Unreachable in practice — `cardProcedure` already enforces viewer+ — but
      // makes the authorization explicit.
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu kartı görüntüleme yetkiniz yok.' });
    }

    const [card] = await ctx.db.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
    if (!card) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
    }

    return { card, relations: ctx.card.relations };
  }),

  /**
   * Update a card's title / description / due date / cover colour. Board
   * `member+` only. At least one of `title` / `description` / `dueAt` /
   * `coverColor` must be present (`dueAt: null` / `coverColor: null` count as
   * changes — "clear the due date" / "clear the cover colour"). An archived
   * *board* is read-only; an archived *list*'s cards may still be edited (only
   * `card.move` is blocked). Idempotent per field: if nothing actually changes,
   * returns `{ ..., changed: false }` without writing activity or bumping
   * `version`. Writes one `activity_events` row per changed field: title →
   * `card.renamed`, description → `card.description_changed` (flag only — the
   * body is not put in the payload), `dueAt` → `card.due_set` (when the new
   * value is non-null) or `card.due_cleared`, `coverColor` → `card.cover_changed`
   * (new value non-null) or `card.cover_cleared`.
   */
  update: cardProcedure.input(updateCardInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı düzenleme yetkiniz yok.' });
    }
    const wantsTitle = input.title !== undefined;
    const wantsDescription = input.description !== undefined;
    const wantsDueAt = 'dueAt' in input; // `dueAt: null` is a real change → key presence, not value.
    const wantsCoverColor = 'coverColor' in input; // `coverColor: null` is a real change → key presence.
    if (!wantsTitle && !wantsDescription && !wantsDueAt && !wantsCoverColor) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx.select(cardCols).from(cards).where(eq(cards.id, ctx.card.id)).limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const dueAtChanged =
        wantsDueAt && (card.dueAt?.getTime() ?? null) !== (input.dueAt?.getTime() ?? null);
      // Normalise an empty description to `null` so `""` and a missing
      // description are the same "no description" — only a real text change
      // writes activity.
      const nextDescription: string | null | undefined = wantsDescription
        ? input.description
          ? input.description
          : null
        : undefined;
      const titleChanged = wantsTitle && input.title !== card.title;
      const descriptionChanged =
        wantsDescription && (nextDescription ?? null) !== (card.description ?? null);
      const coverColorChanged =
        wantsCoverColor && (card.coverColor ?? null) !== (input.coverColor ?? null);

      const patch: Partial<typeof cards.$inferInsert> = {};
      if (titleChanged) patch.title = input.title;
      if (descriptionChanged) patch.description = nextDescription ?? null;
      if (dueAtChanged) patch.dueAt = input.dueAt ?? null;
      if (coverColorChanged) patch.coverColor = input.coverColor ?? null;

      if (Object.keys(patch).length === 0) {
        return { ...card, changed: false as const };
      }

      const [updated] = await tx
        .update(cards)
        .set(patch)
        .where(eq(cards.id, ctx.card.id))
        .returning(cardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (titleChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: 'card.renamed',
          payload: { cardId: card.id, fromTitle: card.title, toTitle: updated.title },
        });
      }
      if (descriptionChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: 'card.description_changed',
          payload: { cardId: card.id },
        });
      }
      if (dueAtChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: updated.dueAt ? 'card.due_set' : 'card.due_cleared',
          payload: updated.dueAt
            ? { cardId: card.id, dueAt: updated.dueAt }
            : { cardId: card.id, fromDueAt: card.dueAt },
        });
      }
      if (coverColorChanged) {
        await tx.insert(activityEvents).values({
          workspaceId: ctx.card.workspaceId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: ctx.session.user.id,
          type: updated.coverColor ? 'card.cover_changed' : 'card.cover_cleared',
          payload: updated.coverColor
            ? { cardId: card.id, coverColor: updated.coverColor }
            : { cardId: card.id, fromCoverColor: card.coverColor },
        });
      }

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Archive (or restore) a card. Board `member+` only. `archived: true` sets
   * `archived_at = now()`; `false` clears it. An archived *board* is read-only.
   * Idempotent: a no-op flip returns `{ id, archivedAt, changed: false }`
   * without writing activity or bumping `version`. Writes a `card.archived`
   * activity event on a real change.
   */
  archive: cardProcedure.input(archiveCardInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı arşivleme yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          listId: cards.listId,
          archivedAt: cards.archivedAt,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      const isArchived = card.archivedAt !== null;
      if (isArchived === input.archived) {
        return { id: card.id, archivedAt: card.archivedAt, changed: false as const };
      }

      const nextArchivedAt = input.archived ? new Date() : null;
      const [updated] = await tx
        .update(cards)
        .set({ archivedAt: nextArchivedAt })
        .where(eq(cards.id, ctx.card.id))
        .returning({ id: cards.id, archivedAt: cards.archivedAt });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.archived',
        payload: { cardId: card.id, archived: input.archived },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { id: updated.id, archivedAt: updated.archivedAt, changed: true as const };
    });
  }),

  /**
   * Mark a card complete (Phase 2.7 — DEM-66). Board `member+` only. Sets
   * `completed = true`, `completed_at = now()`, `completed_by = caller`. An
   * archived *board* is read-only. Idempotent: an already-completed card returns
   * `{ ..., changed: false }` without writing activity or bumping `version`.
   * Writes a `card.completed` activity event on a real change.
   */
  complete: cardProcedure.input(completeCardInput).mutation(async ({ ctx }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartı tamamlama yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      if (card.completed) {
        return {
          id: card.id,
          completed: card.completed,
          completedAt: card.completedAt,
          completedBy: card.completedBy,
          changed: false as const,
        };
      }

      const now = new Date();
      const [updated] = await tx
        .update(cards)
        .set({ completed: true, completedAt: now, completedBy: ctx.session.user.id })
        .where(eq(cards.id, ctx.card.id))
        .returning({
          id: cards.id,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.completed',
        payload: { cardId: card.id },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /**
   * Clear a card's completion (Phase 2.7 — DEM-66). Board `member+` only. Sets
   * `completed = false`, `completed_at = null`, `completed_by = null`. An
   * archived *board* is read-only. Idempotent: an already-incomplete card returns
   * `{ ..., changed: false }` without writing activity or bumping `version`.
   * Writes a `card.uncompleted` activity event on a real change.
   */
  uncomplete: cardProcedure.input(uncompleteCardInput).mutation(async ({ ctx }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Kartın tamamlanmasını geri alma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [card] = await tx
        .select({
          id: cards.id,
          boardId: cards.boardId,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
      }

      const [board] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, card.boardId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (board.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }

      if (!card.completed) {
        return {
          id: card.id,
          completed: card.completed,
          completedAt: card.completedAt,
          completedBy: card.completedBy,
          changed: false as const,
        };
      }

      const [updated] = await tx
        .update(cards)
        .set({ completed: false, completedAt: null, completedBy: null })
        .where(eq(cards.id, ctx.card.id))
        .returning({
          id: cards.id,
          completed: cards.completed,
          completedAt: cards.completedAt,
          completedBy: cards.completedBy,
        });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.card.workspaceId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: ctx.session.user.id,
        type: 'card.uncompleted',
        payload: { cardId: card.id },
      });

      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, card.boardId));

      return { ...updated, changed: true as const };
    });
  }),

  /** Card members (`assignee` / `watcher`) — `card.members.{list,add,remove}`. */
  members: cardMembersRouter,

  /** Card ↔ label links — `card.labels.{list,add,remove}`. */
  labels: cardLabelsRouter,

  /** Card activity feed — `card.activity.list`. */
  activity: router({
    /**
     * List a card's `activity_events`, newest first, capped at 50, joined with
     * the actor's display name. Board `viewer+` (already enforced by
     * `cardProcedure`). No transaction (read-only).
     */
    list: cardProcedure.query(async ({ ctx }) => {
      return ctx.db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          actorId: activityEvents.actorId,
          actorName: users.name,
          payload: activityEvents.payload,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .leftJoin(users, eq(users.id, activityEvents.actorId))
        .where(eq(activityEvents.cardId, ctx.card.id))
        .orderBy(desc(activityEvents.createdAt))
        .limit(50);
    }),
  }),
});
