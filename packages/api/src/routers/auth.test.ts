/**
 * Integration tests for the auth router — specifically `auth.defaultLandingRoute`
 * (DEM-126). Same pattern as `workspace.test.ts`: hit a real Postgres
 * (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`). If no
 * database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  boards,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const rid = () => Math.random().toString(36).slice(2, 12);
const newId = (prefix: string) => `${prefix}_${rid()}`;
const newSlug = (prefix: string) => `${prefix}-${rid()}`;

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('auth.defaultLandingRoute (integration)', () => {
  const db = () => probe!.db;

  // Each test makes its own user(s) + workspace(s); we tear them down at the
  // end so suites don't leak rows into one another.
  const createdUserIds: string[] = [];
  const ownedWorkspaceIds: string[] = [];

  const ensureUser = async (id: string) => {
    await db().insert(users).values({ id, name: id, email: `${id}@example.test` });
    createdUserIds.push(id);
  };

  const insertWorkspace = async (opts: {
    ownerId: string;
    createdAt?: Date;
    archivedAt?: Date | null;
  }) => {
    const [w] = await db()
      .insert(workspaces)
      .values({
        name: `ws-${rid()}`,
        slug: newSlug('ws'),
        ownerId: opts.ownerId,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        ...(opts.archivedAt ? { archivedAt: opts.archivedAt } : {}),
      })
      .returning({ id: workspaces.id });
    if (!w) throw new Error('workspace insert failed');
    ownedWorkspaceIds.push(w.id);
    return w.id;
  };

  const insertBoard = async (opts: {
    workspaceId: string;
    createdAt?: Date;
    archivedAt?: Date | null;
  }) => {
    const [b] = await db()
      .insert(boards)
      .values({
        workspaceId: opts.workspaceId,
        title: `board-${rid()}`,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        ...(opts.archivedAt ? { archivedAt: opts.archivedAt } : {}),
      })
      .returning({ id: boards.id });
    if (!b) throw new Error('board insert failed');
    return b.id;
  };

  afterAll(async () => {
    for (const id of ownedWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  it('returns null when the user has no workspace at all', async () => {
    const userId = newId('u-no-ws');
    await ensureUser(userId);

    const route = await callerFor(userId).auth.defaultLandingRoute();
    expect(route).toBeNull();
  });

  it('returns null when the user is in a workspace with zero non-archived boards', async () => {
    const userId = newId('u-no-board');
    await ensureUser(userId);

    const workspaceId = await insertWorkspace({ ownerId: userId });
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role: 'owner' });
    // One board, but archived → not eligible.
    await insertBoard({ workspaceId, archivedAt: new Date() });

    const route = await callerFor(userId).auth.defaultLandingRoute();
    expect(route).toBeNull();
  });

  it('returns the oldest non-archived board in the oldest non-archived workspace (member+)', async () => {
    const userId = newId('u-happy');
    await ensureUser(userId);

    // Two workspaces; the *older* one should win.
    const olderWs = await insertWorkspace({
      ownerId: userId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newerWs = await insertWorkspace({
      ownerId: userId,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId: olderWs, userId, role: 'owner' },
        { workspaceId: newerWs, userId, role: 'owner' },
      ]);

    // In the older ws: an archived board (skipped), then the actual oldest
    // active board, then a younger active board.
    await insertBoard({
      workspaceId: olderWs,
      createdAt: new Date('2025-12-30T00:00:00Z'),
      archivedAt: new Date(),
    });
    const expectedBoardId = await insertBoard({
      workspaceId: olderWs,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    await insertBoard({
      workspaceId: olderWs,
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });
    // The newer workspace also has a board — should be ignored.
    await insertBoard({
      workspaceId: newerWs,
      createdAt: new Date('2026-02-02T00:00:00Z'),
    });

    const route = await callerFor(userId).auth.defaultLandingRoute();
    expect(route).toEqual({ workspaceId: olderWs, boardId: expectedBoardId });
  });

  it('skips archived workspaces (workspace.list semantics)', async () => {
    const userId = newId('u-skip-arch-ws');
    await ensureUser(userId);

    const archivedWs = await insertWorkspace({
      ownerId: userId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      archivedAt: new Date(),
    });
    const activeWs = await insertWorkspace({
      ownerId: userId,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId: archivedWs, userId, role: 'owner' },
        { workspaceId: activeWs, userId, role: 'owner' },
      ]);

    // The (older) archived workspace has a board — must NOT be picked.
    await insertBoard({
      workspaceId: archivedWs,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    const expectedBoardId = await insertBoard({
      workspaceId: activeWs,
      createdAt: new Date('2026-02-02T00:00:00Z'),
    });

    const route = await callerFor(userId).auth.defaultLandingRoute();
    expect(route).toEqual({ workspaceId: activeWs, boardId: expectedBoardId });
  });

  it('a workspace guest sees no board unless they have an explicit board_members row', async () => {
    const ownerId = newId('u-owner');
    const guestId = newId('u-guest');
    await ensureUser(ownerId);
    await ensureUser(guestId);

    const workspaceId = await insertWorkspace({ ownerId });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: ownerId, role: 'owner' },
        { workspaceId, userId: guestId, role: 'guest' },
      ]);

    // The board the owner created — the guest is NOT a member of it.
    await insertBoard({
      workspaceId,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    expect(await callerFor(guestId).auth.defaultLandingRoute()).toBeNull();

    // Add an explicit board membership on a *second* board → guest now gets a route.
    const guestBoardId = await insertBoard({
      workspaceId,
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });
    await db()
      .insert(boardMembers)
      .values({ boardId: guestBoardId, userId: guestId, role: 'viewer' });

    const route = await callerFor(guestId).auth.defaultLandingRoute();
    expect(route).toEqual({ workspaceId, boardId: guestBoardId });
  });
});
