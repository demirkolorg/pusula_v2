/**
 * Card-membership cleanup on access loss — invariant 24 (2026-07-20).
 *
 * A `card_members` row (assignee/watcher) belongs to a user with effective
 * board access. Membership-change flows revoke that access, and the stale
 * rows they'd otherwise leave behind produce ghost assignees on cards and
 * feed the due-date scheduler's recipient pool. These helpers delete the
 * rows inside the caller's transaction; the notification layer keeps its
 * own emit-time access check as defence-in-depth
 * (`docs/domain/04-bildirim-kurallari.md` Permission check).
 *
 * Callers (see `docs/domain/01-urun-modeli.md` invariant 24):
 *  - `board.members.remove` — when no effective access remains (ws guest
 *    without a seat) → {@link removeCardMembershipsOnBoard}.
 *  - `workspace.members.remove` — every board of the workspace (no ws
 *    membership means no board access, explicit seat or not) →
 *    {@link removeCardMembershipsInWorkspace}.
 *  - `workspace.members.updateRole` (downgrade to `guest`) — boards without
 *    an explicit seat → {@link removeCardMembershipsInWorkspace} with
 *    `keepExplicitSeatBoards`.
 *  - `board.moveToWorkspace` — users with no access in the target workspace
 *    → {@link removeCardMembershipsOnBoardExcept}.
 *
 * NOT a caller: `card.moveToList` — a card moving cross-board keeps its
 * members by design (invariant 16); what moves there is the card, not the
 * user's access.
 */
import { and, eq, inArray, notInArray } from '@pusula/db';
import { boardMembers, boards, cardMembers, cards } from '@pusula/db';
import type { Queryable } from '../middleware/board-access';

/** Delete every card membership a user holds on one board's cards. */
export async function removeCardMembershipsOnBoard(
  tx: Queryable,
  boardId: string,
  userId: string,
): Promise<void> {
  await tx
    .delete(cardMembers)
    .where(
      and(
        eq(cardMembers.userId, userId),
        inArray(
          cardMembers.cardId,
          tx.select({ id: cards.id }).from(cards).where(eq(cards.boardId, boardId)),
        ),
      ),
    );
}

/**
 * Delete a user's card memberships across a workspace's boards. With
 * `keepExplicitSeatBoards` (the guest-downgrade case) boards where the user
 * still holds an explicit `board_members` seat are spared — a guest keeps
 * reaching those.
 */
export async function removeCardMembershipsInWorkspace(
  tx: Queryable,
  workspaceId: string,
  userId: string,
  opts?: { keepExplicitSeatBoards?: boolean },
): Promise<void> {
  const wsBoards = await tx
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.workspaceId, workspaceId));
  let boardIds = wsBoards.map((b) => b.id);
  if (opts?.keepExplicitSeatBoards && boardIds.length > 0) {
    const seats = await tx
      .select({ boardId: boardMembers.boardId })
      .from(boardMembers)
      .where(eq(boardMembers.userId, userId));
    const seatSet = new Set(seats.map((s) => s.boardId));
    boardIds = boardIds.filter((id) => !seatSet.has(id));
  }
  if (boardIds.length === 0) return;
  await tx
    .delete(cardMembers)
    .where(
      and(
        eq(cardMembers.userId, userId),
        inArray(
          cardMembers.cardId,
          tx.select({ id: cards.id }).from(cards).where(inArray(cards.boardId, boardIds)),
        ),
      ),
    );
}

/**
 * Delete card memberships on a board for every user OUTSIDE the accessible
 * set (`board.moveToWorkspace`: explicit seats ∪ target-workspace non-guest
 * members). An empty set deletes all of the board's card memberships —
 * callers always pass at least the moving admin, so that path is theoretical.
 */
export async function removeCardMembershipsOnBoardExcept(
  tx: Queryable,
  boardId: string,
  accessibleUserIds: ReadonlySet<string>,
): Promise<void> {
  const scope = inArray(
    cardMembers.cardId,
    tx.select({ id: cards.id }).from(cards).where(eq(cards.boardId, boardId)),
  );
  const ids = [...accessibleUserIds];
  await tx
    .delete(cardMembers)
    .where(ids.length > 0 ? and(scope, notInArray(cardMembers.userId, ids)) : scope);
}
