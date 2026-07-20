/**
 * Integration tests for the card-membership cleanup helpers (invariant 24 —
 * 2026-07-20). Like the rule-engine tests, runs against a real Postgres
 * (probe → skip on a box without infra).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { boardMembers, cardMembers, users, workspaceMembers } from '@pusula/db';
import {
  removeCardMembershipsInWorkspace,
  removeCardMembershipsOnBoard,
  removeCardMembershipsOnBoardExcept,
} from './card-members-cleanup';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('card-members-cleanup (integration)', () => {
  const db = () => probe!.db;

  const ownerId = newId('u-cmc-owner');
  const targetId = newId('u-cmc-target');
  const otherId = newId('u-cmc-other');
  const createdUserIds = [ownerId, targetId, otherId];

  let workspaceId: string;
  let boardAId: string;
  let boardBId: string;
  let cardAId: string;
  let cardBId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    workspaceId = newId('ws-cmc');
    boardAId = newId('b-cmc-a');
    boardBId = newId('b-cmc-b');
    const listAId = newId('l-cmc-a');
    const listBId = newId('l-cmc-b');
    cardAId = newId('c-cmc-a');
    cardBId = newId('c-cmc-b');
    await db().insert(dbMod.workspaces).values({
      id: workspaceId,
      name: 'CMC WS',
      slug: workspaceId,
      ownerId,
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: ownerId, role: 'owner' },
        { workspaceId, userId: targetId, role: 'member' },
        { workspaceId, userId: otherId, role: 'member' },
      ]);
    await db()
      .insert(dbMod.boards)
      .values([
        { id: boardAId, workspaceId, title: 'CMC Board A' },
        { id: boardBId, workspaceId, title: 'CMC Board B' },
      ]);
    await db()
      .insert(dbMod.lists)
      .values([
        { id: listAId, boardId: boardAId, title: 'LA', position: 'a0' },
        { id: listBId, boardId: boardBId, title: 'LB', position: 'a0' },
      ]);
    await db()
      .insert(dbMod.cards)
      .values([
        { id: cardAId, boardId: boardAId, listId: listAId, title: 'CA', position: 'a0' },
        { id: cardBId, boardId: boardBId, listId: listBId, title: 'CB', position: 'a0' },
      ]);
  });

  beforeEach(async () => {
    // Reset memberships to a known state: target is assignee on both boards'
    // cards, other is watcher on board A's card. Explicit seats are cleared.
    await db()
      .delete(cardMembers)
      .where(dbMod.inArray(cardMembers.cardId, [cardAId, cardBId]));
    await db()
      .delete(boardMembers)
      .where(dbMod.inArray(boardMembers.boardId, [boardAId, boardBId]));
    await db()
      .insert(cardMembers)
      .values([
        { cardId: cardAId, userId: targetId, role: 'assignee' },
        { cardId: cardBId, userId: targetId, role: 'assignee' },
        { cardId: cardAId, userId: otherId, role: 'watcher' },
      ]);
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(cardMembers)
      .where(dbMod.inArray(cardMembers.cardId, [cardAId, cardBId]));
    await db()
      .delete(boardMembers)
      .where(dbMod.inArray(boardMembers.boardId, [boardAId, boardBId]));
    await db().delete(dbMod.cards).where(dbMod.inArray(dbMod.cards.id, [cardAId, cardBId]));
    await db()
      .delete(dbMod.lists)
      .where(dbMod.inArray(dbMod.lists.boardId, [boardAId, boardBId]));
    await db().delete(dbMod.boards).where(dbMod.inArray(dbMod.boards.id, [boardAId, boardBId]));
    await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  async function membershipsOf(userId: string): Promise<string[]> {
    const rows = await db()
      .select({ cardId: cardMembers.cardId })
      .from(cardMembers)
      .where(dbMod.eq(cardMembers.userId, userId));
    return rows.map((r) => r.cardId).sort();
  }

  it('removeCardMembershipsOnBoard: only the given board is touched, other users untouched', async () => {
    await removeCardMembershipsOnBoard(db(), boardAId, targetId);
    expect(await membershipsOf(targetId)).toEqual([cardBId]);
    expect(await membershipsOf(otherId)).toEqual([cardAId]);
  });

  it('removeCardMembershipsInWorkspace: drops every board of the workspace', async () => {
    await removeCardMembershipsInWorkspace(db(), workspaceId, targetId);
    expect(await membershipsOf(targetId)).toEqual([]);
    expect(await membershipsOf(otherId)).toEqual([cardAId]);
  });

  it('removeCardMembershipsInWorkspace + keepExplicitSeatBoards: seat board is spared', async () => {
    await db().insert(boardMembers).values({ boardId: boardBId, userId: targetId, role: 'member' });
    await removeCardMembershipsInWorkspace(db(), workspaceId, targetId, {
      keepExplicitSeatBoards: true,
    });
    expect(await membershipsOf(targetId)).toEqual([cardBId]);
  });

  it('removeCardMembershipsOnBoardExcept: users outside the accessible set are dropped', async () => {
    await removeCardMembershipsOnBoardExcept(db(), boardAId, new Set([otherId]));
    expect(await membershipsOf(targetId)).toEqual([cardBId]); // board A row dropped
    expect(await membershipsOf(otherId)).toEqual([cardAId]); // accessible → kept
  });
});
