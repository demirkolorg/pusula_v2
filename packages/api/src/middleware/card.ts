/**
 * `cardProcedure` — `protectedProcedure` + a middleware that resolves the
 * `cardId` from the procedure input, loads the card row, resolves the caller's
 * board access via `resolveBoardAccess` (the card's board), and also loads the
 * caller's `card_members` relationships (`assignee` / `watcher`, 0..2 rows).
 *
 * This is the *enforcement* point only ("can the caller see this card?", which
 * is exactly "can the caller see the card's board?"); fine-grained authorization
 * (`canEditBoardContent`, …) is done in the procedure body with
 * `@pusula/domain/permissions`. Archived-board read-only enforcement happens in
 * the procedure body (which re-reads inside its transaction). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası) and `docs/architecture/03-backend.md`.
 *
 * - Card not found → `NOT_FOUND` ("Kart bulunamadı.").
 * - Caller cannot see the card's board → `NOT_FOUND` / `FORBIDDEN` (from
 *   `resolveBoardAccess`).
 * - Otherwise `ctx.card = { id, listId, boardId, workspaceId, archivedAt,
 *   boardRole, boardArchivedAt, relations }` is added.
 *
 * The procedure pre-declares `{ cardId: string }` as input; consumers may
 * `.input(...)` additional fields. The middleware reads only `cardId` from the
 * raw input.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { and, eq } from '@pusula/db';
import { cardMembers, cards } from '@pusula/db';
import { idSchema } from '@pusula/domain';
import type { BoardRole, CardRole } from '@pusula/domain';
import { protectedProcedure } from '../trpc';
import { resolveBoardAccess } from './board-access';

/** Minimal shape the card middleware needs from the procedure input. */
const cardIdInput = z.object({ cardId: idSchema });

/** The card context attached by `cardProcedure`. */
export interface CardContext {
  id: string;
  listId: string;
  boardId: string;
  workspaceId: string;
  /** `null` when the card is active; the archive timestamp otherwise. */
  archivedAt: Date | null;
  /** Caller's effective board role on the card's board. */
  boardRole: BoardRole;
  /** `null` when the board is active; the board's archive timestamp otherwise. */
  boardArchivedAt: Date | null;
  /** Caller's `card_members` roles for this card (`assignee` / `watcher`), 0..2. */
  relations: CardRole[];
}

/**
 * Procedure for any operation scoped to a single card the caller can view.
 * Input always includes `cardId: string`.
 */
export const cardProcedure = protectedProcedure
  .input(cardIdInput)
  .use(async ({ ctx, next, getRawInput }) => {
    const parsed = cardIdInput.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'cardId gerekli.' });
    }
    const { cardId } = parsed.data;

    const [card] = await ctx.db
      .select({
        id: cards.id,
        boardId: cards.boardId,
        listId: cards.listId,
        archivedAt: cards.archivedAt,
      })
      .from(cards)
      .where(eq(cards.id, cardId))
      .limit(1);
    if (!card) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
    }

    const board = await resolveBoardAccess(ctx.db, card.boardId, ctx.session.user.id);

    const memberRows = await ctx.db
      .select({ role: cardMembers.role })
      .from(cardMembers)
      .where(and(eq(cardMembers.cardId, card.id), eq(cardMembers.userId, ctx.session.user.id)));
    const relations = memberRows.map((r) => r.role);

    return next({
      ctx: {
        ...ctx,
        card: {
          id: card.id,
          listId: card.listId,
          boardId: card.boardId,
          workspaceId: board.workspaceId,
          archivedAt: card.archivedAt,
          boardRole: board.role,
          boardArchivedAt: board.archivedAt,
          relations,
        } satisfies CardContext,
      },
    });
  });
