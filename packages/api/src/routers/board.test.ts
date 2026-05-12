/**
 * Integration tests for the board router (Phase 2A / DEM-34). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, cards, lists, users, workspaceMembers, workspaces } from '@pusula/db';
import { firstPosition, positionsBetween } from '@pusula/domain';
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

// Workspace owner, a plain member, a guest, and an outsider (no membership at all).
const ownerId = newId('u-bo-owner');
const memberId = newId('u-bo-member');
const guestId = newId('u-bo-guest');
const outsiderId = newId('u-bo-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('board router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  // The list of workspaces we create here so afterAll can cascade-delete everything.
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Board Co',
      slug: newSlug('board-co'),
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
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const actsFor = (boardId: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, boardId));

  // ---------------------------------------------------------------- create

  it('create: a workspace member creates a board, becomes a board admin, and a board.created activity is written', async () => {
    const board = await callerFor(memberId).board.create({
      workspaceId,
      title: 'Sprint Board',
      clientMutationId: newId('cmid'),
    });
    expect(board).toMatchObject({ workspaceId, title: 'Sprint Board', role: 'admin', version: 0 });
    expect(board.archivedAt).toBeNull();

    const members = await db()
      .select()
      .from(boardMembers)
      .where(dbMod.eq(boardMembers.boardId, board.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: memberId, role: 'admin' });

    const acts = await actsFor(board.id);
    expect(acts.some((a) => a.type === 'board.created')).toBe(true);
  });

  it('create: a workspace guest cannot create a board (FORBIDDEN)', async () => {
    await expect(
      callerFor(guestId).board.create({ workspaceId, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: an outsider (no workspace membership) is FORBIDDEN at the workspace middleware', async () => {
    await expect(
      callerFor(outsiderId).board.create({ workspaceId, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ------------------------------------------------------------------ list

  it('list: a workspace owner/member sees every board (inherited role); a guest sees only boards they belong to', async () => {
    // Owner creates one board; member creates another (already created above).
    const ownerBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Owner Board',
      clientMutationId: newId('cmid'),
    });
    // Give the guest an explicit membership on the owner's board.
    await db().insert(boardMembers).values({ boardId: ownerBoard.id, userId: guestId, role: 'viewer' });

    const ownerList = await callerFor(ownerId).board.list({ workspaceId });
    // owner sees at least the two boards created so far
    expect(ownerList.length).toBeGreaterThanOrEqual(2);
    expect(ownerList.every((b) => b.role === 'admin')).toBe(true); // workspace owner ⇒ board admin

    const memberList = await callerFor(memberId).board.list({ workspaceId });
    // member sees every board too; inherits `member` unless explicitly an admin
    expect(memberList.some((b) => b.id === ownerBoard.id && b.role === 'member')).toBe(true);

    const guestList = await callerFor(guestId).board.list({ workspaceId });
    // guest sees only the board they were added to, with the explicit role
    expect(guestList).toHaveLength(1);
    expect(guestList[0]).toMatchObject({ id: ownerBoard.id, role: 'viewer' });
    expect(guestList[0]?.archivedAt).toBeNull();
  });

  // ------------------------------------------------------------------- get

  it('get: an unknown boardId is NOT_FOUND', async () => {
    await expect(callerFor(ownerId).board.get({ boardId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('get: a non-member of the board is FORBIDDEN', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Private-ish Board',
      clientMutationId: newId('cmid'),
    });
    // outsider isn't even in the workspace
    await expect(callerFor(outsiderId).board.get({ boardId: board.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // a guest with no explicit board membership inherits nothing
    await expect(callerFor(guestId).board.get({ boardId: board.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('get: a board member receives the board shell + lists + active cards in position order', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Shaped Board',
      clientMutationId: newId('cmid'),
    });

    // empty board first
    const empty = await callerFor(ownerId).board.get({ boardId: board.id });
    expect(empty.board).toMatchObject({ id: board.id, title: 'Shaped Board', role: 'admin' });
    expect(empty.lists).toEqual([]);
    expect(empty.cards).toEqual([]);

    // seed two lists (one archived) and a few cards (one archived) directly
    const [posA, posB] = positionsBetween(null, null, 2);
    const listActiveId = newId('l');
    const listArchivedId = newId('l');
    await db()
      .insert(lists)
      .values([
        { id: listActiveId, boardId: board.id, title: 'To Do', position: posA! },
        { id: listArchivedId, boardId: board.id, title: 'Old', position: posB!, archivedAt: new Date() },
      ]);
    const [cardPos0, cardPos1] = positionsBetween(null, null, 2);
    await db()
      .insert(cards)
      .values([
        { boardId: board.id, listId: listActiveId, title: 'Second', position: cardPos1! },
        { boardId: board.id, listId: listActiveId, title: 'First', position: cardPos0! },
        {
          boardId: board.id,
          listId: listActiveId,
          title: 'Done card',
          position: firstPosition(),
          archivedAt: new Date(),
        },
      ]);

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    // both lists returned (archived included), in position order
    expect(shaped.lists.map((l) => l.id)).toEqual([listActiveId, listArchivedId]);
    // only the two active cards, ordered by position
    expect(shaped.cards.map((c) => c.title)).toEqual(['First', 'Second']);
    expect(shaped.cards.every((c) => c.archivedAt === null)).toBe(true);
    expect(shaped.cards.every((c) => c.boardId === board.id)).toBe(true);
  });

  // ---------------------------------------------------------------- update

  it('update: the board admin renames it (version bumps, board.renamed activity); a board viewer is FORBIDDEN; empty input is BAD_REQUEST', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Old Title',
      clientMutationId: newId('cmid'),
    });
    // make the guest a viewer on this board
    await db().insert(boardMembers).values({ boardId: board.id, userId: guestId, role: 'viewer' });

    // a board viewer cannot rename
    await expect(
      callerFor(guestId).board.update({ boardId: board.id, title: 'Hax', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // empty input → BAD_REQUEST
    await expect(
      callerFor(ownerId).board.update({ boardId: board.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // admin renames it
    const updated = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'New Title',
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ id: board.id, title: 'New Title', role: 'admin', changed: true });
    expect(updated.version).toBe(board.version + 1);

    const acts = await actsFor(board.id);
    const renamed = acts.find((a) => a.type === 'board.renamed');
    expect(renamed).toBeDefined();
    expect(renamed?.payload).toMatchObject({ fromTitle: 'Old Title', toTitle: 'New Title' });

    // renaming to the same title is an idempotent no-op
    const noop = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'New Title',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: board.id, title: 'New Title', changed: false });
    expect(noop.version).toBe(updated.version);
  });

  // --------------------------------------------------------------- archive

  it('archive: the board admin archives + restores it; idempotent no-op; non-admin is FORBIDDEN; archived board is read-only', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archive Me',
      clientMutationId: newId('cmid'),
    });
    await db().insert(boardMembers).values({ boardId: board.id, userId: guestId, role: 'viewer' });

    // a board viewer cannot archive
    await expect(
      callerFor(guestId).board.archive({ boardId: board.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // admin archives
    const archived = await callerFor(ownerId).board.archive({
      boardId: board.id,
      clientMutationId: newId('cmid'),
    });
    expect(archived).toMatchObject({ id: board.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    // archiving again is a no-op
    const noop = await callerFor(ownerId).board.archive({ boardId: board.id, clientMutationId: newId('cmid') });
    expect(noop).toMatchObject({ id: board.id, changed: false });

    // an archived board is read-only — update rejected
    await expect(
      callerFor(ownerId).board.update({ boardId: board.id, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // restore it
    const restored = await callerFor(ownerId).board.archive({
      boardId: board.id,
      archived: false,
      clientMutationId: newId('cmid'),
    });
    expect(restored).toMatchObject({ id: board.id, archivedAt: null, changed: true });

    // after restore, update works again
    const updated = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'Back In Business',
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ title: 'Back In Business', changed: true });

    const acts = await actsFor(board.id);
    const archivedActs = acts.filter((a) => a.type === 'board.archived');
    // exactly two: archive + restore (no-op did not write one)
    expect(archivedActs).toHaveLength(2);
    expect(archivedActs.map((a) => (a.payload as { archived?: boolean }).archived).sort()).toEqual([false, true]);
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
