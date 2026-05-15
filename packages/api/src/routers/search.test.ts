/**
 * Integration tests for Faz 6.5C `search.query`. These hit a real Postgres
 * with the DEM-104 search schema applied. If local infra is absent or stale, the
 * suite is skipped like the other router integration tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { boardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
import { createContext } from '../context';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

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
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-search-owner');
const guestId = newId('u-search-guest');
const outsiderId = newId('u-search-outsider');
const otherOwnerId = newId('u-search-other');
const createdUserIds = [ownerId, guestId, outsiderId, otherOwnerId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db })) as ReturnType<
    typeof create
  > & {
    search: {
      query(
        input: unknown,
      ): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>;
    };
  };
}

describe.runIf(dbAvailable)('search router (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
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

  async function seedBoard(
    owner = ownerId,
    workspaceName = 'Search API Co',
    boardTitle = 'Sosyal Inceleme',
  ) {
    const ws = await callerFor(owner).workspace.create({
      name: workspaceName,
      slug: newSlug('search-api-co'),
      clientMutationId: crypto.randomUUID(),
    });
    createdWorkspaceIds.push(ws.id);
    const board = await callerFor(owner).board.create({
      workspaceId: ws.id,
      title: boardTitle,
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(owner).list.create({
      boardId: board.id,
      title: 'Basvurular',
      clientMutationId: crypto.randomUUID(),
    });
    return { workspaceId: ws.id, boardId: board.id, listId: list.id };
  }

  it('returns board, list, card, comment, and label matches in a board scope', async () => {
    const { workspaceId, boardId } = await seedBoard(
      ownerId,
      'Search Multi Entity Co',
      'Ortak Arama Panosu',
    );
    const owner = callerFor(ownerId);
    const list = await owner.list.create({
      boardId,
      title: 'Ortak Arama Listesi',
      clientMutationId: crypto.randomUUID(),
    });
    const card = await owner.card.create({
      listId: list.id,
      title: 'Ortak Arama Karti',
      clientMutationId: crypto.randomUUID(),
    });
    await owner.card.update({
      cardId: card.id,
      description: 'Ortak arama govdesi',
      clientMutationId: crypto.randomUUID(),
    });
    await owner.comment.create({
      cardId: card.id,
      body: 'Ortak arama yorumu',
      clientMutationId: crypto.randomUUID(),
    });
    const label = await owner.label.create({
      boardId,
      name: 'Ortak Arama Etiketi',
      color: 'blue',
      clientMutationId: crypto.randomUUID(),
    });
    await owner.card.labels.add({
      cardId: card.id,
      labelId: label.id,
      clientMutationId: crypto.randomUUID(),
    });

    const result = await owner.search.query({ boardId, query: 'ortak arama', limit: 20 });
    const entityTypes = result.items.map((item) => item.entityType);

    expect(entityTypes).toEqual(
      expect.arrayContaining(['board', 'list', 'card', 'comment', 'label']),
    );
    expect(result.items.find((item) => item.entityType === 'board')).toMatchObject({
      title: 'Ortak Arama Panosu',
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}`,
    });
    expect(result.items.find((item) => item.entityType === 'list')).toMatchObject({
      title: 'Ortak Arama Listesi',
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}`,
    });
    expect(result.items.find((item) => item.entityType === 'card')).toMatchObject({
      title: 'Ortak Arama Karti',
      cardId: card.id,
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}?card=${card.id}`,
    });
    expect(result.items.find((item) => item.entityType === 'comment')).toMatchObject({
      title: 'Ortak Arama Karti',
      cardId: card.id,
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}?card=${card.id}`,
    });
    expect(result.items.find((item) => item.entityType === 'label')).toMatchObject({
      title: 'Ortak Arama Etiketi',
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}`,
    });
  });

  it('returns ranked plaintext results with deterministic target urls', async () => {
    const { workspaceId, boardId, listId } = await seedBoard();
    const titleMatch = await callerFor(ownerId).card.create({
      listId,
      title: 'Kira Destegi',
      clientMutationId: crypto.randomUUID(),
    });
    const bodyMatch = await callerFor(ownerId).card.create({
      listId,
      title: 'Dosya Incelemesi',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.update({
      cardId: bodyMatch.id,
      description: 'Kira yardimi evraklari tamamlandi.',
      clientMutationId: crypto.randomUUID(),
    });

    const result = await callerFor(ownerId).search.query({ workspaceId, query: 'kira', limit: 10 });

    const ids = result.items.map((item) => item.entityId);
    expect(ids.indexOf(titleMatch.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(bodyMatch.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(titleMatch.id)).toBeLessThan(ids.indexOf(bodyMatch.id));

    const card = result.items.find((item) => item.entityId === titleMatch.id);
    expect(card).toMatchObject({
      entityType: 'card',
      workspaceId,
      boardId,
      cardId: titleMatch.id,
      cardTitle: 'Kira Destegi',
      title: 'Kira Destegi',
      targetUrl: `/workspaces/${workspaceId}/boards/${boardId}?card=${titleMatch.id}`,
    });
    expect(card?.snippet).toBeTypeOf('string');
    expect(String(card?.snippet)).not.toContain('<');
  });

  it('matches Turkish suffixes, accentless input, and short fuzzy typos', async () => {
    const { workspaceId, listId } = await seedBoard(
      ownerId,
      'Turkish Search Co',
      'KÖYDES Köy Yolları Yapım İşleri',
    );
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'H Köyü Parke Döşeme',
      clientMutationId: crypto.randomUUID(),
    });

    const villageRoot = await callerFor(ownerId).search.query({
      workspaceId,
      query: 'köy',
      limit: 20,
    });
    const villageSuffixed = await callerFor(ownerId).search.query({
      workspaceId,
      query: 'köyü',
      limit: 20,
    });
    const villageAscii = await callerFor(ownerId).search.query({
      workspaceId,
      query: 'koy',
      limit: 20,
    });
    const acronymAscii = await callerFor(ownerId).search.query({
      workspaceId,
      query: 'koydes',
      limit: 20,
    });
    const acronymTypo = await callerFor(ownerId).search.query({
      workspaceId,
      query: 'koyds',
      limit: 20,
    });

    for (const result of [villageRoot, villageSuffixed, villageAscii]) {
      const titles = result.items.map((item) => item.title);
      expect(titles).toEqual(
        expect.arrayContaining(['KÖYDES Köy Yolları Yapım İşleri', 'H Köyü Parke Döşeme']),
      );
    }
    expect(
      acronymAscii.items.some((item) => item.title === 'KÖYDES Köy Yolları Yapım İşleri'),
    ).toBe(true);
    expect(acronymTypo.items.some((item) => item.title === 'KÖYDES Köy Yolları Yapım İşleri')).toBe(
      true,
    );
    expect(villageSuffixed.items.some((item) => item.entityId === card.id)).toBe(true);
    expect(villageAscii.items.some((item) => item.entityId === card.id)).toBe(true);
    expect(villageRoot.items.map((item) => item.title).slice(0, 5)).toEqual(
      villageSuffixed.items.map((item) => item.title).slice(0, 5),
    );
  });

  it('does not leak inaccessible board or workspace results', async () => {
    const { workspaceId, boardId: visibleBoardId } = await seedBoard();
    await db().insert(workspaceMembers).values({ workspaceId, userId: guestId, role: 'guest' });
    await db()
      .insert(boardMembers)
      .values({ boardId: visibleBoardId, userId: guestId, role: 'viewer' });

    const hiddenBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Sosyal Gizli Pano',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(otherOwnerId).board.create({
      workspaceId: (await seedBoard(otherOwnerId, 'Other Search Co')).workspaceId,
      title: 'Sosyal Baska Workspace',
      clientMutationId: crypto.randomUUID(),
    });

    const guestResult = await callerFor(guestId).search.query({
      workspaceId,
      query: 'sosyal',
      limit: 20,
    });
    expect(guestResult.items.some((item) => item.entityId === visibleBoardId)).toBe(true);
    expect(guestResult.items.some((item) => item.entityId === hiddenBoard.id)).toBe(false);

    const globalResult = await callerFor(ownerId).search.query({ query: 'sosyal', limit: 50 });
    expect(globalResult.items.some((item) => item.title === 'Sosyal Baska Workspace')).toBe(false);

    await expect(
      callerFor(outsiderId).search.query({ workspaceId, query: 'sosyal' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('filters archived documents by default and can include them explicitly', async () => {
    const { boardId, listId } = await seedBoard();
    const archivedCard = await callerFor(ownerId).card.create({
      listId,
      title: 'Arsiv Kira Kart',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.archive({
      cardId: archivedCard.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    const activeOnly = await callerFor(ownerId).search.query({
      boardId,
      query: 'arsiv kira',
      limit: 10,
    });
    expect(activeOnly.items.some((item) => item.entityId === archivedCard.id)).toBe(false);

    const withArchived = await callerFor(ownerId).search.query({
      boardId,
      query: 'arsiv kira',
      includeArchived: true,
      limit: 10,
    });
    expect(withArchived.items.some((item) => item.entityId === archivedCard.id)).toBe(true);
  });

  it('rejects short queries before touching search', async () => {
    await expect(callerFor(ownerId).search.query({ query: 'a' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
