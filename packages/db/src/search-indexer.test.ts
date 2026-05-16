import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from './index';
import {
  attachments,
  boardMembers,
  boards,
  cardLabels,
  cards,
  comments,
  labels,
  lists,
  searchDocuments,
  users,
  workspaceMembers,
  workspaces,
} from './schema';
import {
  deleteSearchDocument,
  normalizeSearchLabels,
  normalizeSearchText,
  reindexSearchDocuments,
  upsertSearchDocument,
} from './search-indexer';

describe('search-indexer normalization', () => {
  it('trims whitespace-only text to null and collapses internal whitespace', () => {
    expect(normalizeSearchText(null)).toBeNull();
    expect(normalizeSearchText('   ')).toBeNull();
    expect(normalizeSearchText('  Sosyal   inceleme\nbekliyor  ')).toBe('Sosyal inceleme bekliyor');
  });

  it('normalizes labels by trimming, removing blanks, and de-duping', () => {
    expect(normalizeSearchLabels(['  Acil ', '', 'acil', 'Acil', '  Gida  '])).toEqual([
      'Acil',
      'acil',
      'Gida',
    ]);
  });
});

// Probe the database at collection time so `describe.runIf` can react to it.
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  await probe.db.execute(dbMod.sql`select card_id, search_vector from search_documents limit 0`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('search-indexer (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const ownerId = newId('u-search-owner');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });
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

  async function seedBoard() {
    const ownerId = newId('u-search');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(workspaces)
      .values({ name: 'Search Co', slug: newId('search-co'), ownerId })
      .returning({ id: workspaces.id });
    createdWorkspaceIds.push(ws!.id);

    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: ws!.id, userId: ownerId, role: 'owner' });
    const [board] = await db()
      .insert(boards)
      .values({ workspaceId: ws!.id, title: 'Nakdi Yardimlar' })
      .returning({ id: boards.id });
    await db().insert(boardMembers).values({ boardId: board!.id, userId: ownerId, role: 'admin' });

    return { workspaceId: ws!.id, boardId: board!.id, ownerId };
  }

  async function readDoc(
    entityType: 'board' | 'list' | 'card' | 'comment' | 'label' | 'attachment',
    entityId: string,
  ) {
    const rows = await db()
      .select({
        id: searchDocuments.id,
        workspaceId: searchDocuments.workspaceId,
        boardId: searchDocuments.boardId,
        cardId: searchDocuments.cardId,
        title: searchDocuments.title,
        body: searchDocuments.body,
        labels: searchDocuments.labels,
        archivedAt: searchDocuments.archivedAt,
      })
      .from(searchDocuments)
      .where(
        dbMod.and(
          dbMod.eq(searchDocuments.entityType, entityType),
          dbMod.eq(searchDocuments.entityId, entityId),
        ),
      );
    return rows;
  }

  it('upserts one board document and updates the same row on rerun', async () => {
    const { boardId, workspaceId } = await seedBoard();

    await upsertSearchDocument(db(), { entityType: 'board', entityId: boardId });
    await db().update(boards).set({ title: 'Sosyal Yardim' }).where(dbMod.eq(boards.id, boardId));
    await upsertSearchDocument(db(), { entityType: 'board', entityId: boardId });

    const rows = await readDoc('board', boardId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId,
      boardId,
      cardId: null,
      title: 'Sosyal Yardim',
      body: null,
      labels: [],
      archivedAt: null,
    });
  });

  it('indexes card title, description, labels, and inherited archive state', async () => {
    const { boardId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'Yeni Basvurular', position: 'a0' })
      .returning({ id: lists.id });
    const [card] = await db()
      .insert(cards)
      .values({
        boardId,
        listId: list!.id,
        title: 'Ahmet Y.',
        description: 'Kira yardimi',
        position: 'a0',
      })
      .returning({ id: cards.id });
    const insertedLabels = await db()
      .insert(labels)
      .values([
        { boardId, name: 'Acil', color: 'red' },
        { boardId, name: 'Kira', color: 'blue' },
      ])
      .returning({ id: labels.id });
    await db()
      .insert(cardLabels)
      .values(insertedLabels.map((label) => ({ cardId: card!.id, labelId: label.id })));

    await upsertSearchDocument(db(), { entityType: 'card', entityId: card!.id });
    await db().update(lists).set({ archivedAt: new Date() }).where(dbMod.eq(lists.id, list!.id));
    await upsertSearchDocument(db(), { entityType: 'card', entityId: card!.id });

    const rows = await readDoc('card', card!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.boardId).toBe(boardId);
    expect(rows[0]?.cardId).toBe(card!.id);
    expect(rows[0]?.title).toBe('Ahmet Y.');
    expect(rows[0]?.body).toBe('Kira yardimi');
    expect(rows[0]?.labels).toEqual(['Acil', 'Kira']);
    expect(rows[0]?.archivedAt).toBeInstanceOf(Date);
  });

  it('deletes documents for soft-deleted comments', async () => {
    const { boardId, ownerId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'L', position: 'a0' })
      .returning({ id: lists.id });
    const [card] = await db()
      .insert(cards)
      .values({ boardId, listId: list!.id, title: 'C', position: 'a0' })
      .returning({ id: cards.id });
    const [comment] = await db()
      .insert(comments)
      .values({ cardId: card!.id, authorId: ownerId, body: 'Gorunen yorum' })
      .returning({ id: comments.id });

    await upsertSearchDocument(db(), { entityType: 'comment', entityId: comment!.id });
    expect(await readDoc('comment', comment!.id)).toHaveLength(1);

    await db()
      .update(comments)
      .set({ deletedAt: new Date(), body: '' })
      .where(dbMod.eq(comments.id, comment!.id));
    await upsertSearchDocument(db(), { entityType: 'comment', entityId: comment!.id });

    expect(await readDoc('comment', comment!.id)).toHaveLength(0);
  });

  it('indexes a committed attachment by file name + description, skips drafts', async () => {
    const { boardId, ownerId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'L', position: 'a0' })
      .returning({ id: lists.id });
    const [card] = await db()
      .insert(cards)
      .values({ boardId, listId: list!.id, title: 'C', position: 'a0' })
      .returning({ id: cards.id });

    // Draft (`committed_at IS NULL`) — never indexed.
    const [draft] = await db()
      .insert(attachments)
      .values({
        cardId: card!.id,
        boardId,
        uploaderId: ownerId,
        storageKey: newId('key'),
        fileName: 'taslak-rapor.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        committedAt: null,
      })
      .returning({ id: attachments.id });
    await upsertSearchDocument(db(), { entityType: 'attachment', entityId: draft!.id });
    expect(await readDoc('attachment', draft!.id)).toHaveLength(0);

    // Committed — indexed with file name as title and description as body.
    const [committed] = await db()
      .insert(attachments)
      .values({
        cardId: card!.id,
        boardId,
        uploaderId: ownerId,
        storageKey: newId('key'),
        fileName: 'kira-sozlesmesi.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        description: 'Imzali kira belgesi',
        committedAt: new Date(),
      })
      .returning({ id: attachments.id });
    await upsertSearchDocument(db(), { entityType: 'attachment', entityId: committed!.id });

    const rows = await readDoc('attachment', committed!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      boardId,
      cardId: card!.id,
      title: 'kira-sozlesmesi.pdf',
      body: 'Imzali kira belgesi',
      labels: [],
      archivedAt: null,
    });

    // Archiving the card propagates to the attachment's archive state.
    await db().update(cards).set({ archivedAt: new Date() }).where(dbMod.eq(cards.id, card!.id));
    await upsertSearchDocument(db(), { entityType: 'attachment', entityId: committed!.id });
    expect((await readDoc('attachment', committed!.id))[0]?.archivedAt).toBeInstanceOf(Date);
  });

  it('reindexes a board scope idempotently', async () => {
    const { boardId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'Liste', position: 'a0' })
      .returning({ id: lists.id });
    const [card] = await db()
      .insert(cards)
      .values({ boardId, listId: list!.id, title: 'Kart', position: 'a0' })
      .returning({ id: cards.id });
    await db().insert(labels).values({ boardId, name: 'Etiket', color: 'green' });

    const first = await reindexSearchDocuments(db(), { boardId });
    const second = await reindexSearchDocuments(db(), { boardId });

    expect(first.upserted).toBeGreaterThanOrEqual(4);
    expect(second.deleted).toBe(0);
    expect(await readDoc('board', boardId)).toHaveLength(1);
    expect(await readDoc('list', list!.id)).toHaveLength(1);
    expect(await readDoc('card', card!.id)).toHaveLength(1);
  });

  it('deleteSearchDocument removes one entity document', async () => {
    const { boardId } = await seedBoard();

    await upsertSearchDocument(db(), { entityType: 'board', entityId: boardId });
    await deleteSearchDocument(db(), { entityType: 'board', entityId: boardId });

    expect(await readDoc('board', boardId)).toHaveLength(0);
  });
});
