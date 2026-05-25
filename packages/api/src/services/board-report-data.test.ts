/**
 * Faz 14D integration tests — `loadBoardForClassicReport` (DEM-293).
 *
 * Live Postgres pattern (card.test.ts ile aynı); DB yoksa suite skip.
 * Lokal: `pnpm infra:up` + `pnpm db:migrate`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  labels as labelsTable,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  CLASSIC_REPORT_COMMENTS_PER_CARD,
  loadBoardForClassicReport,
} from './board-report-data';

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
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-rep14d-owner');
const memberId = newId('u-rep14d-member');
const viewerId = newId('u-rep14d-viewer');
const createdUserIds = [ownerId, memberId, viewerId];

describe.runIf(dbAvailable)('loadBoardForClassicReport (Faz 14D — DEM-293)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));

    workspaceId = newId('w');
    await db()
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Faz14D Workspace', slug: newSlug('faz14d'), ownerId });
    createdWorkspaceIds.push(workspaceId);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: ownerId, role: 'owner' },
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: viewerId, role: 'member' },
      ]);
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
    await probe?.pool.end();
  });

  async function seedBoard(title: string) {
    const boardId = newId('b');
    await db().insert(boards).values({ id: boardId, workspaceId, title });
    await db().insert(boardMembers).values([
      { boardId, userId: ownerId, role: 'admin' },
      { boardId, userId: memberId, role: 'member' },
      { boardId, userId: viewerId, role: 'viewer' },
    ]);
    return boardId;
  }

  it('boş pano (0 liste) → stats sıfır, lists boş, members 3 admin/member/viewer', async () => {
    const boardId = await seedBoard('Empty Board');

    const data = await loadBoardForClassicReport(db(), boardId);

    expect(data).not.toBeNull();
    expect(data!.board.title).toBe('Empty Board');
    expect(data!.workspace.name).toBe('Faz14D Workspace');
    expect(data!.lists).toHaveLength(0);
    expect(data!.stats).toEqual({
      totalCards: 0,
      completedCards: 0,
      openCards: 0,
      progressPercent: 0,
    });
    expect(data!.members).toHaveLength(3);
    const roles = data!.members.map((m) => m.role).sort();
    expect(roles).toEqual(['admin', 'member', 'viewer']);
    for (const m of data!.members) expect(m.assignedCardCount).toBe(0);
  });

  it('1 liste 3 kart (1 tamam, 2 açık) → stats doğru, progressPercent yuvarlı', async () => {
    const boardId = await seedBoard('Stats Board');
    const listId = newId('l');
    await db().insert(lists).values({ id: listId, boardId, title: 'List', position: 'a0' });

    const c1 = newId('c');
    const c2 = newId('c');
    const c3 = newId('c');
    await db().insert(cards).values([
      { id: c1, boardId, listId, title: 'Done card', position: 'a0', completed: true, completedAt: new Date(), completedBy: ownerId },
      { id: c2, boardId, listId, title: 'Open card 1', position: 'a1', completed: false },
      { id: c3, boardId, listId, title: 'Open card 2', position: 'a2', completed: false },
    ]);

    const data = await loadBoardForClassicReport(db(), boardId);

    expect(data!.lists).toHaveLength(1);
    expect(data!.lists[0]?.cards).toHaveLength(3);
    expect(data!.stats.totalCards).toBe(3);
    expect(data!.stats.completedCards).toBe(1);
    expect(data!.stats.openCards).toBe(2);
    // 1/3 = 33.33% → yuvarlanmış 33
    expect(data!.stats.progressPercent).toBe(33);

    const sorted = data!.lists[0]!.cards.map((c) => c.title);
    expect(sorted).toEqual(['Done card', 'Open card 1', 'Open card 2']);
    expect(data!.lists[0]!.cards[0]?.completed).toBe(true);
    expect(data!.lists[0]!.cards[0]?.completedAt).not.toBeNull();
    expect(data!.lists[0]!.cards[1]?.completed).toBe(false);
  });

  it('checklist tree: 1 kart → 2 checklist → 4 item (2+2) doğru struct, position sıralı', async () => {
    const boardId = await seedBoard('Checklist Board');
    const listId = newId('l');
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    const cardId = newId('c');
    await db()
      .insert(cards)
      .values({ id: cardId, boardId, listId, title: 'Card', position: 'a0', completed: false });

    const cl1 = newId('cl');
    const cl2 = newId('cl');
    await db().insert(checklists).values([
      { id: cl1, cardId, title: 'Pre-flight', position: 'a0' },
      { id: cl2, cardId, title: 'Post-flight', position: 'a1' },
    ]);
    await db().insert(checklistItems).values([
      { id: newId('ci'), checklistId: cl1, content: 'Step 1', position: 'a0', completed: true },
      { id: newId('ci'), checklistId: cl1, content: 'Step 2', position: 'a1', completed: false },
      { id: newId('ci'), checklistId: cl2, content: 'Step 3', position: 'a0', completed: false },
      { id: newId('ci'), checklistId: cl2, content: 'Step 4', position: 'a1', completed: false },
    ]);

    const data = await loadBoardForClassicReport(db(), boardId);

    const card = data!.lists[0]!.cards[0]!;
    expect(card.checklists).toHaveLength(2);
    expect(card.checklists[0]!.title).toBe('Pre-flight');
    expect(card.checklists[0]!.items).toHaveLength(2);
    expect(card.checklists[0]!.items[0]?.content).toBe('Step 1');
    expect(card.checklists[0]!.items[0]?.completed).toBe(true);
    expect(card.checklists[1]!.title).toBe('Post-flight');
    expect(card.checklists[1]!.items).toHaveLength(2);
  });

  it('son N yorum cap (14A karar 7): DB 8 yorum → dönen 5 + commentCount 8 + author resolve', async () => {
    const boardId = await seedBoard('Comments Board');
    const listId = newId('l');
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    const cardId = newId('c');
    await db()
      .insert(cards)
      .values({ id: cardId, boardId, listId, title: 'Card', position: 'a0', completed: false });

    const base = Date.now();
    const commentRows = Array.from({ length: 8 }, (_, i) => ({
      id: newId('co'),
      cardId,
      authorId: ownerId,
      body: `Comment ${i + 1}`,
      createdAt: new Date(base + i * 1000), // i=0 oldest, i=7 newest
    }));
    await db().insert(comments).values(commentRows);

    const data = await loadBoardForClassicReport(db(), boardId);

    const card = data!.lists[0]!.cards[0]!;
    expect(card.commentCount).toBe(8);
    expect(card.comments).toHaveLength(CLASSIC_REPORT_COMMENTS_PER_CARD);
    // En yeni → en eski sıralı; ilk eleman "Comment 8"
    expect(card.comments[0]!.body).toBe('Comment 8');
    expect(card.comments[4]!.body).toBe('Comment 4');
    expect(card.comments[0]!.author).toEqual({ id: ownerId, name: `Name ${ownerId}` });
  });

  it('arşivli liste/kart filter dışı: 1 archived liste + 1 active liste + 1 archived kart → sadece active', async () => {
    const boardId = await seedBoard('Archive Board');
    const activeList = newId('l');
    const archivedList = newId('l');
    await db()
      .insert(lists)
      .values([
        { id: activeList, boardId, title: 'Active', position: 'a0' },
        {
          id: archivedList,
          boardId,
          title: 'Archived',
          position: 'a1',
          archivedAt: new Date(),
        },
      ]);

    const liveCard = newId('c');
    const archivedCard = newId('c');
    await db().insert(cards).values([
      { id: liveCard, boardId, listId: activeList, title: 'Live', position: 'a0', completed: false },
      {
        id: archivedCard,
        boardId,
        listId: activeList,
        title: 'Archived',
        position: 'a1',
        completed: false,
        archivedAt: new Date(),
      },
    ]);

    const data = await loadBoardForClassicReport(db(), boardId);

    expect(data!.lists).toHaveLength(1);
    expect(data!.lists[0]!.id).toBe(activeList);
    expect(data!.lists[0]!.cards).toHaveLength(1);
    expect(data!.lists[0]!.cards[0]!.title).toBe('Live');
    expect(data!.stats.totalCards).toBe(1);
  });

  it('pano yok → null döner; kart üyeleri (assignee) + etiketler + ek sayımı doğru', async () => {
    const missing = await loadBoardForClassicReport(db(), 'does-not-exist');
    expect(missing).toBeNull();

    const boardId = await seedBoard('Relations Board');
    const listId = newId('l');
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    const cardId = newId('c');
    await db()
      .insert(cards)
      .values({ id: cardId, boardId, listId, title: 'Card', position: 'a0', completed: false });

    await db().insert(cardMembers).values([
      { cardId, userId: ownerId, role: 'assignee' },
      { cardId, userId: memberId, role: 'assignee' },
      { cardId, userId: viewerId, role: 'watcher' },
    ]);

    const lblId = newId('lbl');
    await db().insert(labelsTable).values({ id: lblId, boardId, name: 'Urgent', color: 'red' });
    await db().insert(cardLabels).values({ cardId, labelId: lblId });

    const data = await loadBoardForClassicReport(db(), boardId);
    const card = data!.lists[0]!.cards[0]!;
    // assignee 2 user, watcher hariç
    expect(card.members).toHaveLength(2);
    expect(card.members.map((m) => m.userId).sort()).toEqual([ownerId, memberId].sort());
    expect(card.labels).toEqual([{ id: lblId, name: 'Urgent', color: 'red' }]);

    // Member assignedCardCount kontrol
    const ownerMember = data!.members.find((m) => m.userId === ownerId)!;
    expect(ownerMember.assignedCardCount).toBe(1);
    const viewerMember = data!.members.find((m) => m.userId === viewerId)!;
    expect(viewerMember.assignedCardCount).toBe(0); // watcher sayılmaz
  });
});
