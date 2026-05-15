/**
 * Integration tests for the list router (Phase 2B / DEM-35). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { positionBetween, POSITION_COMPACTION_MAX_LEN } from '@pusula/domain';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext, type EnqueueCompaction, type EnqueueRealtimePublish } from '../context';

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

/** A caller whose tRPC context carries a (mock) `enqueueCompaction` hook. */
function callerWithEnqueue(userId: string, enqueueCompaction: EnqueueCompaction) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db, enqueueCompaction }));
}

/** A caller whose tRPC context carries a (mock) `enqueueRealtimePublish` hook. */
function callerWithRealtimeEnqueue(userId: string, enqueueRealtimePublish: EnqueueRealtimePublish) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db, enqueueRealtimePublish }));
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
      clientMutationId: crypto.randomUUID(),
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
      clientMutationId: crypto.randomUUID(),
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
  const rtEventsFor = (board: string) =>
    db().select().from(realtimeEvents).where(dbMod.eq(realtimeEvents.boardId, board));
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
      clientMutationId: crypto.randomUUID(),
    });
    expect(first).toMatchObject({ boardId, title: 'To Do' });
    expect(first.archivedAt).toBeNull();
    expect(first.icon).toBeNull();
    expect(first.iconColor).toBeNull();

    const second = await callerFor(memberId).list.create({
      boardId,
      title: 'Doing',
      clientMutationId: crypto.randomUUID(),
    });
    const third = await callerFor(ownerId).list.create({
      boardId,
      title: 'Done',
      clientMutationId: crypto.randomUUID(),
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

  it('create: new lists project null icon and iconColor through board.get', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Default Icon List',
      clientMutationId: crypto.randomUUID(),
    });

    expect(list).toMatchObject({ icon: null, iconColor: null });

    const board = await callerFor(ownerId).board.get({ boardId });
    expect(board.lists.find((l) => l.id === list.id)).toMatchObject({
      id: list.id,
      icon: null,
      iconColor: null,
    });
  });

  it('create: a board viewer (workspace guest with an explicit viewer membership) is FORBIDDEN', async () => {
    await expect(
      callerFor(guestId).list.create({
        boardId,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: an archived board rejects new lists (BAD_REQUEST)', async () => {
    const archivedBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Frozen',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).board.archive({
      boardId: archivedBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.create({
        boardId: archivedBoard.id,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------- update

  it('update: a member renames a list (list.renamed activity, boards.version bumps); same title is an idempotent no-op; a viewer is FORBIDDEN', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Old List',
      clientMutationId: crypto.randomUUID(),
    });
    const vAfterCreate = await boardVersion(boardId);

    // viewer cannot rename
    await expect(
      callerFor(guestId).list.update({
        boardId,
        listId: list.id,
        title: 'Hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await callerFor(memberId).list.update({
      boardId,
      listId: list.id,
      title: 'New List',
      clientMutationId: crypto.randomUUID(),
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
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: list.id, title: 'New List', changed: false });
    expect(await boardVersion(boardId)).toBe(vBeforeNoop);
  });

  it('update: renaming a list that belongs to another board is BAD_REQUEST', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Other Board',
      clientMutationId: crypto.randomUUID(),
    });
    const otherList = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'Their List',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.update({
        boardId, // authenticate against *this* board…
        listId: otherList.id, // …but reference a list in another board
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('update color: viewer is FORBIDDEN; archived board and archived list reject writes', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Guarded Color List',
      clientMutationId: crypto.randomUUID(),
    });

    await expect(
      callerFor(guestId).list.update({
        boardId,
        listId: list.id,
        color: 'yesil',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const archivedBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archived Color Board',
      clientMutationId: crypto.randomUUID(),
    });
    const archivedBoardList = await callerFor(ownerId).list.create({
      boardId: archivedBoard.id,
      title: 'Frozen Color List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).board.archive({
      boardId: archivedBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.update({
        boardId: archivedBoard.id,
        listId: archivedBoardList.id,
        color: 'sari',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const archivedList = await callerFor(ownerId).list.create({
      boardId,
      title: 'Archived List Color',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.archive({
      boardId,
      listId: archivedList.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.update({
        boardId,
        listId: archivedList.id,
        color: 'turuncu',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('update color: setting a colour persists DB state, writes activity + realtime, bumps version, and projects through board.get', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Colour Set List',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const updated = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      color: 'yesil',
      clientMutationId: cmid,
    });

    expect(updated).toMatchObject({ id: list.id, color: 'yesil', changed: true });
    const [row] = await db()
      .select({ color: dbMod.lists.color })
      .from(dbMod.lists)
      .where(dbMod.eq(dbMod.lists.id, list.id))
      .limit(1);
    expect(row?.color).toBe('yesil');
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const colorActivity = (await actsFor(boardId)).find(
      (a) =>
        a.type === 'list.color_changed' && (a.payload as { listId?: string }).listId === list.id,
    );
    expect(colorActivity?.payload).toMatchObject({
      listId: list.id,
      oldColor: null,
      newColor: 'yesil',
      clientMutationId: cmid,
    });

    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect(
      (updatedEvents[0]!.payload as { data: { listId: string; color: string | null } }).data,
    ).toMatchObject({
      listId: list.id,
      color: 'yesil',
    });
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });

    const board = await callerFor(ownerId).board.get({ boardId });
    expect(board.lists.find((l) => l.id === list.id)?.color).toBe('yesil');
  });

  it('update color: clearing a colour writes list.color_cleared with oldColor and realtime color:null', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Colour Clear List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      color: 'mavi',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const cleared = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      color: null,
      clientMutationId: cmid,
    });

    expect(cleared).toMatchObject({ id: list.id, color: null, changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);
    const clearedActivity = (await actsFor(boardId)).find(
      (a) =>
        a.type === 'list.color_cleared' &&
        (a.payload as { clientMutationId?: string }).clientMutationId === cmid,
    );
    expect(clearedActivity?.payload).toMatchObject({
      listId: list.id,
      oldColor: 'mavi',
      clientMutationId: cmid,
    });
    expect(clearedActivity?.payload).not.toHaveProperty('newColor');

    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect((updatedEvents[0]!.payload as { data: { color: string | null } }).data.color).toBeNull();
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });
  });

  it('update color: setting the same colour is an idempotent no-op', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Colour Noop List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      color: 'gri',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const activityCount = (await actsFor(boardId)).filter(
      (a) => a.type === 'list.color_changed' || a.type === 'list.color_cleared',
    ).length;
    const realtimeCount = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated',
    ).length;
    const enqueue = vi.fn<EnqueueRealtimePublish>();

    const noop = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      color: 'gri',
      clientMutationId: crypto.randomUUID(),
    });

    expect(noop).toMatchObject({ id: list.id, color: 'gri', changed: false });
    expect(await boardVersion(boardId)).toBe(v0);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'list.color_changed' || a.type === 'list.color_cleared',
      ).length,
    ).toBe(activityCount);
    expect((await rtEventsFor(boardId)).filter((r) => r.type === 'list.updated').length).toBe(
      realtimeCount,
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('update color: explicit undefined does not clear an existing colour', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Undefined Colour List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      color: 'sari',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const colorActivityCount = (await actsFor(boardId)).filter(
      (a) => a.type === 'list.color_changed' || a.type === 'list.color_cleared',
    ).length;
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const renamed = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      title: 'Renamed without touching colour',
      color: undefined,
      clientMutationId: cmid,
    });

    expect(renamed).toMatchObject({
      id: list.id,
      title: 'Renamed without touching colour',
      color: 'sari',
      changed: true,
    });
    expect(await boardVersion(boardId)).toBe(v0 + 1);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'list.color_changed' || a.type === 'list.color_cleared',
      ).length,
    ).toBe(colorActivityCount);
    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect(
      (updatedEvents[0]!.payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty('color');
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });
  });

  it('update icon: setting icon and iconColor persists DB state, writes activity + realtime, bumps version, and projects through board.get', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Icon Set List',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const updated = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      icon: 'star',
      iconColor: 'mavi',
      clientMutationId: cmid,
    });

    expect(updated).toMatchObject({
      id: list.id,
      icon: 'star',
      iconColor: 'mavi',
      changed: true,
    });
    const [row] = await db()
      .select({ icon: dbMod.lists.icon, iconColor: dbMod.lists.iconColor })
      .from(dbMod.lists)
      .where(dbMod.eq(dbMod.lists.id, list.id))
      .limit(1);
    expect(row).toMatchObject({ icon: 'star', iconColor: 'mavi' });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const iconActivity = (await actsFor(boardId)).find(
      (a) =>
        a.type === 'list.icon_changed' && (a.payload as { listId?: string }).listId === list.id,
    );
    expect(iconActivity?.payload).toMatchObject({
      listId: list.id,
      oldIcon: null,
      newIcon: 'star',
      oldIconColor: null,
      newIconColor: 'mavi',
      clientMutationId: cmid,
    });

    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect(
      (
        updatedEvents[0]!.payload as {
          data: { listId: string; icon: string | null; iconColor: string | null };
        }
      ).data,
    ).toMatchObject({
      listId: list.id,
      icon: 'star',
      iconColor: 'mavi',
    });
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });

    const board = await callerFor(ownerId).board.get({ boardId });
    expect(board.lists.find((l) => l.id === list.id)).toMatchObject({
      icon: 'star',
      iconColor: 'mavi',
    });
  });

  it('update icon: clearing only iconColor keeps the icon and writes list.icon_changed with realtime iconColor:null', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Icon Colour Clear List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      icon: 'flag',
      iconColor: 'kirmizi',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const cleared = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      iconColor: null,
      clientMutationId: cmid,
    });

    expect(cleared).toMatchObject({
      id: list.id,
      icon: 'flag',
      iconColor: null,
      changed: true,
    });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const iconActivity = (await actsFor(boardId)).find(
      (a) =>
        a.type === 'list.icon_changed' &&
        (a.payload as { clientMutationId?: string }).clientMutationId === cmid,
    );
    expect(iconActivity?.payload).toMatchObject({
      listId: list.id,
      oldIcon: 'flag',
      newIcon: 'flag',
      oldIconColor: 'kirmizi',
      newIconColor: null,
      clientMutationId: cmid,
    });

    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect((updatedEvents[0]!.payload as { data: Record<string, unknown> }).data).toMatchObject({
      listId: list.id,
      iconColor: null,
    });
    expect(
      (updatedEvents[0]!.payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty('icon');
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });
  });

  it('update icon: clearing icon clears iconColor too and writes list.icon_cleared with realtime nulls', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Icon Clear List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      icon: 'rocket',
      iconColor: 'mor',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const cleared = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      icon: null,
      clientMutationId: cmid,
    });

    expect(cleared).toMatchObject({
      id: list.id,
      icon: null,
      iconColor: null,
      changed: true,
    });
    const [row] = await db()
      .select({ icon: dbMod.lists.icon, iconColor: dbMod.lists.iconColor })
      .from(dbMod.lists)
      .where(dbMod.eq(dbMod.lists.id, list.id))
      .limit(1);
    expect(row).toMatchObject({ icon: null, iconColor: null });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const iconActivity = (await actsFor(boardId)).find(
      (a) =>
        a.type === 'list.icon_cleared' &&
        (a.payload as { clientMutationId?: string }).clientMutationId === cmid,
    );
    expect(iconActivity?.payload).toMatchObject({
      listId: list.id,
      oldIcon: 'rocket',
      oldIconColor: 'mor',
      clientMutationId: cmid,
    });
    expect(iconActivity?.payload).not.toHaveProperty('newIcon');
    expect(iconActivity?.payload).not.toHaveProperty('newIconColor');

    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect((updatedEvents[0]!.payload as { data: Record<string, unknown> }).data).toMatchObject({
      listId: list.id,
      icon: null,
      iconColor: null,
    });
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });
  });

  it('update icon: setting the same icon and iconColor is an idempotent no-op', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Icon Noop List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      icon: 'calendar',
      iconColor: 'sari',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const activityCount = (await actsFor(boardId)).filter(
      (a) => a.type === 'list.icon_changed' || a.type === 'list.icon_cleared',
    ).length;
    const realtimeCount = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated',
    ).length;
    const enqueue = vi.fn<EnqueueRealtimePublish>();

    const noop = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      icon: 'calendar',
      iconColor: 'sari',
      clientMutationId: crypto.randomUUID(),
    });

    expect(noop).toMatchObject({
      id: list.id,
      icon: 'calendar',
      iconColor: 'sari',
      changed: false,
    });
    expect(await boardVersion(boardId)).toBe(v0);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'list.icon_changed' || a.type === 'list.icon_cleared',
      ).length,
    ).toBe(activityCount);
    expect((await rtEventsFor(boardId)).filter((r) => r.type === 'list.updated').length).toBe(
      realtimeCount,
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('update icon: explicit undefined does not clear existing icon fields', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Undefined Icon List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.update({
      boardId,
      listId: list.id,
      icon: 'bookmark',
      iconColor: 'pembe',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const iconActivityCount = (await actsFor(boardId)).filter(
      (a) => a.type === 'list.icon_changed' || a.type === 'list.icon_cleared',
    ).length;
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const renamed = await callerWithRealtimeEnqueue(memberId, enqueue).list.update({
      boardId,
      listId: list.id,
      title: 'Renamed without touching icon',
      icon: undefined,
      iconColor: undefined,
      clientMutationId: cmid,
    });

    expect(renamed).toMatchObject({
      id: list.id,
      title: 'Renamed without touching icon',
      icon: 'bookmark',
      iconColor: 'pembe',
      changed: true,
    });
    expect(await boardVersion(boardId)).toBe(v0 + 1);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'list.icon_changed' || a.type === 'list.icon_cleared',
      ).length,
    ).toBe(iconActivityCount);
    const updatedEvents = (await rtEventsFor(boardId)).filter(
      (r) => r.type === 'list.updated' && r.clientMutationId === cmid,
    );
    expect(updatedEvents).toHaveLength(1);
    expect(
      (updatedEvents[0]!.payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty('icon');
    expect(
      (updatedEvents[0]!.payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty('iconColor');
    expect(enqueue).toHaveBeenCalledWith({ eventId: updatedEvents[0]!.id });
  });

  // --------------------------------------------------------------- archive

  it('archive: a member archives + restores a list; idempotent no-op; list.archived activity is written', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Archive Me',
      clientMutationId: crypto.randomUUID(),
    });

    const archived = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(archived).toMatchObject({ id: list.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    // archiving again is a no-op
    const noop = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: list.id, changed: false });

    // restore it
    const restored = await callerFor(memberId).list.archive({
      boardId,
      listId: list.id,
      archived: false,
      clientMutationId: crypto.randomUUID(),
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

  // ------------------------------------------------------------------ move (DEM-42)

  it('move: reorders a list within the board (in front of, behind, into the middle); writes list.moved activity; bumps boards.version', async () => {
    // Fresh board with three lists A < B < C.
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Move Board',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });
    const c = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'C',
      clientMutationId: crypto.randomUUID(),
    });
    expect(a.position < b.position).toBe(true);
    expect(b.position < c.position).toBe(true);

    // Move C to the front (before A): C < A < B.
    const v0 = await boardVersion(board.id);
    const movedToFront = await callerFor(memberId).list.move({
      boardId: board.id,
      listId: c.id,
      afterListId: a.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(movedToFront).toMatchObject({ id: c.id, changed: true });
    expect(movedToFront.position < a.position).toBe(true);
    expect(await boardVersion(board.id)).toBe(v0 + 1);

    const movedActs1 = (await actsFor(board.id)).filter(
      (e) => e.type === 'list.moved' && (e.payload as { listId?: string }).listId === c.id,
    );
    expect(movedActs1).toHaveLength(1);
    expect(movedActs1[0]?.payload).toMatchObject({
      listId: c.id,
      fromPosition: c.position,
      toPosition: movedToFront.position,
    });

    // Move C to the end (after B): A < B < C.
    const movedToEnd = await callerFor(memberId).list.move({
      boardId: board.id,
      listId: c.id,
      beforeListId: b.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(movedToEnd.changed).toBe(true);
    expect(b.position < movedToEnd.position).toBe(true);

    // Move C into the middle (between A and B): A < C < B.
    const movedToMiddle = await callerFor(memberId).list.move({
      boardId: board.id,
      listId: c.id,
      beforeListId: a.id,
      afterListId: b.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(movedToMiddle.changed).toBe(true);
    expect(a.position < movedToMiddle.position).toBe(true);
    expect(movedToMiddle.position < b.position).toBe(true);
  });

  it('move: a client-supplied newPosition is accepted when valid and rejected (BAD_REQUEST) when out of bounds', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'NewPosition Board',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });
    const c = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'C',
      clientMutationId: crypto.randomUUID(),
    });

    // valid: a position strictly between A and B
    const between = positionBetween(a.position, b.position);
    const ok = await callerFor(memberId).list.move({
      boardId: board.id,
      listId: c.id,
      beforeListId: a.id,
      afterListId: b.id,
      newPosition: between,
      clientMutationId: crypto.randomUUID(),
    });
    expect(ok).toMatchObject({ id: c.id, position: between, changed: true });

    // invalid: a position that is NOT between A and B (use B's own position — not < B)
    await expect(
      callerFor(memberId).list.move({
        boardId: board.id,
        listId: c.id,
        beforeListId: a.id,
        afterListId: b.id,
        newPosition: b.position,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('move: moving a list that belongs to another board is BAD_REQUEST; an archived board is BAD_REQUEST', async () => {
    // list in another board
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Move Other Board',
      clientMutationId: crypto.randomUUID(),
    });
    const otherList = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'Their List',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.move({
        boardId, // authenticate against *this* board…
        listId: otherList.id, // …but reference a list in another board
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // archived board
    const archBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Move Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    const archList = await callerFor(ownerId).list.create({
      boardId: archBoard.id,
      title: 'Doomed',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).board.archive({
      boardId: archBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).list.move({
        boardId: archBoard.id,
        listId: archList.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
  });

  it('move: a board viewer is FORBIDDEN', async () => {
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Viewer Cannot Move',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(guestId).list.move({
        boardId,
        listId: list.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('move: a no-op (the list is already at the resolved position) is changed:false — no activity, no version bump', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Noop Move Board',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(board.id);
    const before0 = (await actsFor(board.id)).filter((e) => e.type === 'list.moved').length;

    // Ask to move B to exactly its own position (newPosition === b.position).
    const noop = await callerFor(memberId).list.move({
      boardId: board.id,
      listId: b.id,
      beforeListId: a.id,
      newPosition: b.position,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: b.id, position: b.position, changed: false });
    expect(await boardVersion(board.id)).toBe(v0);
    expect((await actsFor(board.id)).filter((e) => e.type === 'list.moved').length).toBe(before0);
  });

  // ---------------------------------------------------- compaction enqueue (DEM-44)

  it('move: a normal (short) new position does NOT enqueue a compaction job; a no-op move does not either', async () => {
    const enqueue = vi.fn<EnqueueCompaction>();
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Compaction Short Board',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });

    // A real move into the middle (between A and B) — short key.
    const moved = await callerWithEnqueue(memberId, enqueue).list.move({
      boardId: board.id,
      listId: b.id,
      afterListId: a.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(moved.changed).toBe(true);
    expect(moved.position.length).toBeLessThan(POSITION_COMPACTION_MAX_LEN);
    expect(enqueue).not.toHaveBeenCalled();

    // A no-op move (same position) — must not enqueue.
    await callerWithEnqueue(memberId, enqueue).list.move({
      boardId: board.id,
      listId: b.id,
      newPosition: moved.position,
      afterListId: a.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('move: producing a long fractional position enqueues a board-scope compaction job (once, with the right scope)', async () => {
    const enqueue = vi.fn<EnqueueCompaction>();
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Compaction Long Board',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });
    const target = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Target',
      clientMutationId: crypto.randomUUID(),
    });

    // Pin A/B to known adjacent keys so a long-but-valid `newPosition` is easy
    // to construct: `'a0' < 'a0' + 'V'…V < 'a1'`. (Building a 50+ char key via
    // repeated `positionBetween` would need thousands of bisections.)
    await db().update(dbMod.lists).set({ position: 'a0' }).where(dbMod.eq(dbMod.lists.id, a.id));
    await db().update(dbMod.lists).set({ position: 'a1' }).where(dbMod.eq(dbMod.lists.id, b.id));
    const longPos = 'a0' + 'V'.repeat(POSITION_COMPACTION_MAX_LEN);
    expect(longPos.length).toBeGreaterThanOrEqual(POSITION_COMPACTION_MAX_LEN);
    expect('a0' < longPos && longPos < 'a1').toBe(true);

    const moved = await callerWithEnqueue(memberId, enqueue).list.move({
      boardId: board.id,
      listId: target.id,
      beforeListId: a.id,
      afterListId: b.id,
      newPosition: longPos,
      clientMutationId: crypto.randomUUID(),
    });
    expect(moved).toMatchObject({ id: target.id, position: longPos, changed: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ kind: 'board', boardId: board.id });
  });
});

describe.runIf(dbAvailable)('list router — realtime outbox (Faz 5B / DEM-84)', () => {
  const db = () => probe!.db;
  const owner = newId('u-rt-list-owner');
  const member = newId('u-rt-list-member');
  let wsId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values([
        { id: owner, name: owner, email: `${owner}@example.test` },
        { id: member, name: member, email: `${member}@example.test` },
      ]);
    const create = createCallerFactory(appRouter);
    const caller = create(createContext({ session: session(owner), db: db() }));
    const ws = await caller.workspace.create({
      name: 'RT List Co',
      slug: newSlug('rt-list-co'),
      clientMutationId: crypto.randomUUID(),
    });
    wsId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: member, role: 'member' });
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    await db()
      .delete(users)
      .where(dbMod.inArray(users.id, [owner, member]));
  });

  const rtEventsFor = (boardId: string) =>
    db().select().from(realtimeEvents).where(dbMod.eq(realtimeEvents.boardId, boardId));

  it('list.create writes a pending realtime_events row and enqueues it', async () => {
    const create = createCallerFactory(appRouter);
    const board = await create(createContext({ session: session(owner), db: db() })).board.create({
      workspaceId: wsId,
      title: 'RT Create',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();
    const list = await callerWithRealtimeEnqueue(member, enqueue).list.create({
      boardId: board.id,
      title: 'L1',
      clientMutationId: cmid,
    });

    const rt = await rtEventsFor(board.id);
    const created = rt.filter((r) => r.type === 'list.created');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      boardId: board.id,
      workspaceId: wsId,
      actorId: member,
      clientMutationId: cmid,
      publishedAt: null,
    });
    const payload = created[0]!.payload as { seq: number; data: { listId: string } };
    expect(payload.seq).toBeGreaterThan(0);
    expect(payload.data.listId).toBe(list.id);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ eventId: created[0]!.id });
  });

  it('list.move writes a list.moved realtime event with from/to positions', async () => {
    const create = createCallerFactory(appRouter);
    const owner_ = create(createContext({ session: session(owner), db: db() }));
    const board = await owner_.board.create({
      workspaceId: wsId,
      title: 'RT Move',
      clientMutationId: crypto.randomUUID(),
    });
    const a = await owner_.list.create({
      boardId: board.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await owner_.list.create({
      boardId: board.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();
    const moved = await callerWithRealtimeEnqueue(member, enqueue).list.move({
      boardId: board.id,
      listId: b.id,
      afterListId: a.id,
      clientMutationId: cmid,
    });
    expect(moved.changed).toBe(true);

    const rt = await rtEventsFor(board.id);
    const movedEvts = rt.filter((r) => r.type === 'list.moved');
    expect(movedEvts).toHaveLength(1);
    expect(movedEvts[0]!.clientMutationId).toBe(cmid);
    const data = (movedEvts[0]!.payload as { data: { listId: string; toPosition: string } }).data;
    expect(data.listId).toBe(b.id);
    expect(data.toPosition).toBe(moved.position);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('list.update writes no realtime event for an idempotent no-op', async () => {
    const create = createCallerFactory(appRouter);
    const owner_ = create(createContext({ session: session(owner), db: db() }));
    const board = await owner_.board.create({
      workspaceId: wsId,
      title: 'RT Noop',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await owner_.list.create({
      boardId: board.id,
      title: 'Same Title',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const r = await callerWithRealtimeEnqueue(member, enqueue).list.update({
      boardId: board.id,
      listId: list.id,
      title: 'Same Title', // unchanged
      clientMutationId: crypto.randomUUID(),
    });
    expect(r.changed).toBe(false);

    const rt = await rtEventsFor(board.id);
    expect(rt.filter((r) => r.type === 'list.updated')).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
