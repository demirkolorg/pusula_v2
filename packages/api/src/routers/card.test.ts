/**
 * Integration tests for the card router (Phase 2C / DEM-36). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, cardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

// Probe the database at collection time so `describe.runIf` can react to it.
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

// Workspace owner, a plain member, a guest (board viewer), and an outsider.
const ownerId = newId('u-ca-owner');
const memberId = newId('u-ca-member');
const guestId = newId('u-ca-guest');
const outsiderId = newId('u-ca-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('card router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Card Co',
      slug: newSlug('card-co'),
      clientMutationId: newId('cmid'),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: guestId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Card Board',
      clientMutationId: newId('cmid'),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: guestId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: newId('cmid'),
    });
    listId = list.id;
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const actsFor = (board: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, board));
  const boardVersion = async (board: string) => {
    const [row] = await db()
      .select({ version: dbMod.boards.version })
      .from(dbMod.boards)
      .where(dbMod.eq(dbMod.boards.id, board))
      .limit(1);
    return row!.version;
  };

  // ---------------------------------------------------------------- create

  it('create: a member appends cards to a list in ascending position order; card.created activity; card.boardId === list.boardId; boards.version bumps', async () => {
    const v0 = await boardVersion(boardId);

    const first = await callerFor(memberId).card.create({
      listId,
      title: 'First card',
      clientMutationId: newId('cmid'),
    });
    expect(first).toMatchObject({ listId, boardId, title: 'First card' });
    expect(first.boardId).toBe(boardId); // card ⊆ list.board invariant
    expect(first.archivedAt).toBeNull();
    expect(first.description).toBeNull();
    expect(first.dueAt).toBeNull();

    const second = await callerFor(memberId).card.create({
      listId,
      title: 'Second card',
      clientMutationId: newId('cmid'),
    });
    expect(first.position < second.position).toBe(true);

    const acts = await actsFor(boardId);
    const created = acts.filter(
      (a) => a.type === 'card.created' && (a.payload as { cardId?: string }).cardId === first.id,
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.payload).toMatchObject({ cardId: first.id, listId, title: 'First card' });
    expect(created[0]?.cardId).toBe(first.id);

    expect(await boardVersion(boardId)).toBe(v0 + 2);
  });

  it('create: a board viewer is FORBIDDEN; an unknown listId is NOT_FOUND', async () => {
    await expect(
      callerFor(guestId).card.create({ listId, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(memberId).card.create({
        listId: 'does-not-exist',
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('create: an archived list rejects new cards; an archived board rejects new cards (BAD_REQUEST)', async () => {
    // archived list on the active board
    const archivedList = await callerFor(ownerId).list.create({
      boardId,
      title: 'Frozen List',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).list.archive({
      boardId,
      listId: archivedList.id,
      clientMutationId: newId('cmid'),
    });
    await expect(
      callerFor(ownerId).card.create({
        listId: archivedList.id,
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a list on an archived board
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived',
      clientMutationId: newId('cmid'),
    });
    const listOnOther = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'List On Other',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).board.archive({ boardId: otherBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).card.create({
        listId: listOnOther.id,
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ------------------------------------------------------------------- get

  it('get: a board member receives the card + relations; an unknown cardId is NOT_FOUND; an outsider is FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Readable card',
      clientMutationId: newId('cmid'),
    });
    // give the member an `assignee` relationship
    await db().insert(cardMembers).values({ cardId: card.id, userId: memberId, role: 'assignee' });

    const seenByMember = await callerFor(memberId).card.get({ cardId: card.id });
    expect(seenByMember.card).toMatchObject({ id: card.id, boardId, listId, title: 'Readable card' });
    expect(seenByMember.relations).toEqual(['assignee']);

    // a board viewer (guest) can read it too, with no relations
    const seenByViewer = await callerFor(guestId).card.get({ cardId: card.id });
    expect(seenByViewer.card.id).toBe(card.id);
    expect(seenByViewer.relations).toEqual([]);

    await expect(callerFor(ownerId).card.get({ cardId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(callerFor(outsiderId).card.get({ cardId: card.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ---------------------------------------------------------------- update

  it('update: title → card.renamed; description → card.description_changed; dueAt set → card.due_set, dueAt:null → card.due_cleared; empty input → BAD_REQUEST; viewer → FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Editable card',
      clientMutationId: newId('cmid'),
    });

    // empty input → BAD_REQUEST
    await expect(
      callerFor(ownerId).card.update({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a board viewer cannot edit
    await expect(
      callerFor(guestId).card.update({
        cardId: card.id,
        title: 'Hax',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // rename
    const vBeforeRename = await boardVersion(boardId);
    const renamed = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Renamed card',
      clientMutationId: newId('cmid'),
    });
    expect(renamed).toMatchObject({ id: card.id, title: 'Renamed card', changed: true });
    expect(await boardVersion(boardId)).toBe(vBeforeRename + 1);

    // same title again → idempotent no-op
    const noop = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Renamed card',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: card.id, changed: false });

    // description
    const withDescription = await callerFor(memberId).card.update({
      cardId: card.id,
      description: 'Some details here.',
      clientMutationId: newId('cmid'),
    });
    expect(withDescription).toMatchObject({ description: 'Some details here.', changed: true });

    // dueAt set
    const due = new Date('2026-12-31T09:00:00.000Z');
    const withDue = await callerFor(memberId).card.update({
      cardId: card.id,
      dueAt: due,
      clientMutationId: newId('cmid'),
    });
    expect(withDue.changed).toBe(true);
    expect(withDue.dueAt?.getTime()).toBe(due.getTime());

    // dueAt cleared
    const cleared = await callerFor(memberId).card.update({
      cardId: card.id,
      dueAt: null,
      clientMutationId: newId('cmid'),
    });
    expect(cleared).toMatchObject({ dueAt: null, changed: true });

    const acts = await actsFor(boardId);
    const forCard = (t: string) =>
      acts.filter((a) => a.type === t && (a.payload as { cardId?: string }).cardId === card.id);
    expect(forCard('card.renamed')).toHaveLength(1);
    expect(forCard('card.renamed')[0]?.payload).toMatchObject({
      fromTitle: 'Editable card',
      toTitle: 'Renamed card',
    });
    expect(forCard('card.description_changed')).toHaveLength(1);
    expect(forCard('card.due_set')).toHaveLength(1);
    expect(forCard('card.due_cleared')).toHaveLength(1);
    // every activity row for this card carries cardId on the column too
    expect(acts.filter((a) => a.cardId === card.id).length).toBeGreaterThanOrEqual(5);
  });

  it('update: a combined title + description update writes both activity rows but bumps version once', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Combo card',
      clientMutationId: newId('cmid'),
    });
    const v0 = await boardVersion(boardId);
    const updated = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Combo card v2',
      description: 'Now with a description.',
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ title: 'Combo card v2', description: 'Now with a description.', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const forCard = (t: string) =>
      acts.filter((a) => a.type === t && (a.payload as { cardId?: string }).cardId === card.id);
    expect(forCard('card.renamed')).toHaveLength(1);
    expect(forCard('card.description_changed')).toHaveLength(1);
  });

  // --------------------------------------------------------------- archive

  it('archive: a member archives + restores a card; idempotent no-op; card.archived activity is written', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Archive Me card',
      clientMutationId: newId('cmid'),
    });

    const archived = await callerFor(memberId).card.archive({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(archived).toMatchObject({ id: card.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const noop = await callerFor(memberId).card.archive({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: card.id, changed: false });

    const restored = await callerFor(memberId).card.archive({
      cardId: card.id,
      archived: false,
      clientMutationId: newId('cmid'),
    });
    expect(restored).toMatchObject({ id: card.id, archivedAt: null, changed: true });

    const acts = await actsFor(boardId);
    const archivedActs = acts.filter(
      (a) => a.type === 'card.archived' && (a.payload as { cardId?: string }).cardId === card.id,
    );
    expect(archivedActs).toHaveLength(2);
    expect(archivedActs.map((a) => (a.payload as { archived?: boolean }).archived).sort()).toEqual([
      false,
      true,
    ]);
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
