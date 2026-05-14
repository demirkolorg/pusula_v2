/**
 * Integration tests for board access requests (DEM-102).
 *
 * These hit a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` +
 * `pnpm db:migrate`). If no database is reachable the suite is skipped rather
 * than failing on a box without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardAccessRequests,
  boardMembers,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { appRouter } from '../root';
import { createContext } from '../context';
import { createCallerFactory } from '../trpc';

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
const emailOf = (id: string) => `${id}@example.test`;

const ownerId = newId('u-bar-owner');
const boardAdminId = newId('u-bar-boardadmin');
const requesterId = newId('u-bar-requester');
const rejectRequesterId = newId('u-bar-reject');
const viewerId = newId('u-bar-viewer');
const createdUserIds = [ownerId, boardAdminId, requesterId, rejectRequesterId, viewerId];

const session = (id: string) => ({ user: { id, email: emailOf(id), name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('board access requests router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: emailOf(id) })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Access Request Co',
      slug: newSlug('access-request-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);

    await db()
      .insert(workspaceMembers)
      .values([{ workspaceId, userId: boardAdminId, role: 'member' }]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Private Roadmap',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;

    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: boardAdminId, role: 'admin' },
        { boardId, userId: viewerId, role: 'viewer' },
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

  it('context: an outsider cannot call board.get but can see safe board/workspace context and their account', async () => {
    await expect(callerFor(requesterId).board.get({ boardId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const context = await callerFor(requesterId).board.accessRequests.context({ boardId });

    expect(context).toMatchObject({
      board: { id: boardId, title: 'Private Roadmap' },
      workspace: { id: workspaceId, name: 'Access Request Co' },
      currentUser: { id: requesterId, name: requesterId, email: emailOf(requesterId) },
      access: { hasAccess: false, role: null },
      request: { status: 'none', id: null },
    });
    expect(context).not.toHaveProperty('lists');
    expect(context).not.toHaveProperty('cards');
  });

  it('request: creates one pending request per board/requester and returns the same pending row on repeat', async () => {
    const first = await callerFor(requesterId).board.accessRequests.request({
      boardId,
      message: 'Bu panoya erişmem gerekiyor.',
      clientMutationId: crypto.randomUUID(),
    });
    const second = await callerFor(requesterId).board.accessRequests.request({
      boardId,
      message: 'Tekrar talep.',
      clientMutationId: crypto.randomUUID(),
    });

    expect(first).toMatchObject({ status: 'pending', boardId, requesterId });
    expect(second).toMatchObject({ id: first.id, status: 'pending', boardId, requesterId });

    const pending = await db()
      .select()
      .from(boardAccessRequests)
      .where(
        dbMod.and(
          dbMod.eq(boardAccessRequests.boardId, boardId),
          dbMod.eq(boardAccessRequests.requesterId, requesterId),
          dbMod.eq(boardAccessRequests.status, 'pending'),
        ),
      );
    expect(pending).toHaveLength(1);
  });

  it('approve: provisions a missing workspace guest and selected board role in one transaction', async () => {
    const [beforeWs] = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, requesterId),
        ),
      )
      .limit(1);
    expect(beforeWs).toBeUndefined();

    const request = await callerFor(requesterId).board.accessRequests.request({
      boardId,
      clientMutationId: crypto.randomUUID(),
    });
    if (!request.id) throw new Error('expected a pending request id');

    const approved = await callerFor(boardAdminId).board.accessRequests.approve({
      boardId,
      requestId: request.id,
      role: 'viewer',
      clientMutationId: crypto.randomUUID(),
    });
    expect(approved).toMatchObject({
      id: request.id,
      status: 'approved',
      requesterId,
      role: 'viewer',
      workspaceRoleCreated: true,
      boardRoleCreated: true,
    });

    const [wsRow] = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, requesterId),
        ),
      )
      .limit(1);
    expect(wsRow).toMatchObject({ role: 'guest' });

    const [boardRow] = await db()
      .select()
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, requesterId),
        ),
      )
      .limit(1);
    expect(boardRow).toMatchObject({ role: 'viewer' });

    const visible = await callerFor(requesterId).board.get({ boardId });
    expect(visible.board).toMatchObject({ id: boardId, role: 'viewer' });

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.boardId, boardId));
    expect(
      acts.some(
        (event) =>
          event.type === 'board.member_added' &&
          (event.payload as { userId?: string; role?: string }).userId === requesterId &&
          (event.payload as { userId?: string; role?: string }).role === 'viewer',
      ),
    ).toBe(true);
  });

  it('reject: closes a pending request and later approve is rejected', async () => {
    const request = await callerFor(rejectRequesterId).board.accessRequests.request({
      boardId,
      clientMutationId: crypto.randomUUID(),
    });
    if (!request.id) throw new Error('expected a pending request id');

    const rejected = await callerFor(ownerId).board.accessRequests.reject({
      boardId,
      requestId: request.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(rejected).toMatchObject({ id: request.id, status: 'rejected' });

    await expect(
      callerFor(ownerId).board.accessRequests.approve({
        boardId,
        requestId: request.id,
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('list: board admins see pending requests and viewers cannot list them', async () => {
    const rows = await callerFor(ownerId).board.accessRequests.list({ boardId });
    expect(rows.some((row) => row.requesterId === rejectRequesterId)).toBe(false);

    await expect(callerFor(viewerId).board.accessRequests.list({ boardId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
