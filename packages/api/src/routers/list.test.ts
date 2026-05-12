/**
 * Integration tests for the list router (Phase 2B / DEM-35). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
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

// Workspace owner, a plain member, and a guest (who'll be a board viewer).
const ownerId = newId('u-li-owner');
const memberId = newId('u-li-member');
const guestId = newId('u-li-guest');
const createdUserIds = [ownerId, memberId, guestId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('list router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  // The list of workspaces we create here so afterAll can cascade-delete everything.
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'List Co',
      slug: newSlug('list-co'),
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
      title: 'List Board',
      clientMutationId: newId('cmid'),
    });
    boardId = board.id;
    // The guest gets an explicit `viewer` membership on the board.
    await db().insert(boardMembers).values({ boardId, userId: guestId, role: 'viewer' });
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

  it('create: a member appends lists to the board in ascending position order; list.created activity is written; boards.version bumps', async () => {
    const v0 = await boardVersion(boardId);

    const first = await callerFor(memberId).list.create({
      boardId,
      title: 'To Do',
      clientMutationId: newId('cmid'),
    });
    expect(first).toMatchObject({ boardId, title: 'To Do' });
    expect(first.archivedAt).toBeNull();

    const second = await callerFor(memberId).list.create({
      boardId,
      title: 'Doing',
      clientMutationId: newId('cmid'),
    });
    const third = await callerFor(ownerId).list.create({
      boardId,
      title: 'Done',
      clientMutationId: newId('cmid'),
    });

    // positions strictly increase in creation order (append-only)
    expect(first.position < second.position).toBe(true);
    expect(second.position < third.position).toBe(true);

    const acts = await actsFor(boardId);
    const created = acts.filter((a) => a.type === 'list.created');
    expect(created.length).toBeGreaterThanOrEqual(3);
    expect(created.some((a) => (a.payload as { listId?: string }).listId === first.id)).toBe(true);

    expect(await boardVersion(boardId)).toBe(v0 + 3);
  });

  it('create: a board viewer (workspace guest with an explicit viewer membership) is FORBIDDEN', async () => {
    await expect(
      callerFor(guestId).list.create({ boardId, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: an archived board rejects new lists (BAD_REQUEST)', async () => {
    const archivedBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Frozen',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).board.archive({ boardId: archivedBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).list.create({
        boardId: archivedBoard.id,
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------- update

  it('update: a member renames a list (list.renamed activity, boards.version bumps); same title is an idempotent no-op; a viewer is FORBIDDEN', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Old List',
      clientMutationId: newId('cmid'),
    });
    const vAfterCreate = await boardVersion(boardId);

    // viewer cannot rename
    await expect(
      callerFor(guestId).list.update({
        boardId,
        listId: list.id,
        title: 'Hax',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await callerFor(memberId).list.update({
      boardId,
      listId: list.id,
      title: 'New List',
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ id: list.id, title: 'New List', changed: true });
    expect(await boardVersion(boardId)).toBe(vAfterCreate + 1);

    const acts = await actsFor(boardId);
    const renamed = acts.find(
      (a) => a.type === 'list.renamed' && (a.payload as { listId?: string }).listId === list.id,
    );
    expect(renamed).toBeDefined();
    expect(renamed?.payload).toMatchObject({ fromTitle: 'Old List', toTitle: 'New List' });

    // renaming to the same title is an idempotent no-op (no version bump, no activity)
    const vBeforeNoop = await boardVersion(boardId);
    const noop = await callerFor(memberId).list.update({
      boardId,
      listId: list.id,
      title: 'New List',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: list.id, title: 'New List', changed: false });
    expect(await boardVersion(boardId)).toBe(vBeforeNoop);
  });

  it('update: renaming a list that belongs to another board is BAD_REQUEST', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Other Board',
      clientMutationId: newId('cmid'),
    });
    const otherList = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'Their List',
      clientMutationId: newId('cmid'),
    });
    await expect(
      callerFor(ownerId).list.update({
        boardId, // authenticate against *this* board…
        listId: otherList.id, // …but reference a list in another board
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // --------------------------------------------------------------- archive

  it('archive: a member archives + restores a list; idempotent no-op; list.archived activity is written', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Archive Me',
      clientMutationId: newId('cmid'),
    });

    const archived = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      clientMutationId: newId('cmid'),
    });
    expect(archived).toMatchObject({ id: list.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    // archiving again is a no-op
    const noop = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: list.id, changed: false });

    // restore it
    const restored = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      archived: false,
      clientMutationId: newId('cmid'),
    });
    expect(restored).toMatchObject({ id: list.id, archivedAt: null, changed: true });

    const acts = await actsFor(boardId);
    const archivedActs = acts.filter(
      (a) => a.type === 'list.archived' && (a.payload as { listId?: string }).listId === list.id,
    );
    // exactly two: archive + restore (the no-op did not write one)
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
