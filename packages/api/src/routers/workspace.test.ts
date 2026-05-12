/**
 * Integration tests for the workspace router. These hit a real Postgres
 * (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`). If no
 * database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, users, workspaceMembers, workspaces } from '@pusula/db';
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

const ownerId = newId('u-owner');
const adminId = newId('u-admin');
const memberId = newId('u-member');
const outsiderId = newId('u-outsider');
const createdUserIds = [ownerId, adminId, memberId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('workspace router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    await db().delete(workspaces).where(dbMod.eq(workspaces.ownerId, ownerId));
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
    await probe!.pool.end();
  });

  it('create: makes the creator an owner member and writes a workspace.created activity', async () => {
    const ws = await callerFor(ownerId).workspace.create({
      name: 'Acme Inc',
      slug: newSlug('acme'),
      clientMutationId: newId('cmid-create'),
    });
    workspaceId = ws.id;
    expect(ws.name).toBe('Acme Inc');

    const members = await db()
      .select()
      .from(workspaceMembers)
      .where(dbMod.eq(workspaceMembers.workspaceId, workspaceId));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(acts.some((a) => a.type === 'workspace.created')).toBe(true);
  });

  it('create: rejects a duplicate slug with CONFLICT', async () => {
    const caller = callerFor(ownerId);
    const slug = newSlug('dup');
    await caller.workspace.create({ name: 'First', slug, clientMutationId: newId('cmid') });
    await expect(
      caller.workspace.create({ name: 'Second', slug, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('list: returns the workspaces the user belongs to', async () => {
    const list = await callerFor(ownerId).workspace.list();
    expect(list.some((w) => w.id === workspaceId)).toBe(true);
  });

  it('get: a non-member gets FORBIDDEN; a member gets the shell', async () => {
    await expect(callerFor(outsiderId).workspace.get({ workspaceId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const shell = await callerFor(ownerId).workspace.get({ workspaceId });
    expect(shell).toMatchObject({ id: workspaceId, role: 'owner' });
    expect(shell.memberCount).toBeGreaterThanOrEqual(1);
  });

  it('get: an unknown workspace is NOT_FOUND', async () => {
    await expect(callerFor(ownerId).workspace.get({ workspaceId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('members: list + updateRole + remove enforce roles and write activity', async () => {
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: memberId, role: 'member' },
      ]);

    const ownerCaller = callerFor(ownerId);
    const memberList = await ownerCaller.workspace.members.list({ workspaceId });
    expect(memberList.map((m) => m.userId).sort()).toEqual([adminId, memberId, ownerId].sort());

    // A plain member cannot change roles.
    await expect(
      callerFor(memberId).workspace.members.updateRole({
        workspaceId,
        userId: adminId,
        role: 'member',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The owner can; activity recorded.
    const res = await ownerCaller.workspace.members.updateRole({
      workspaceId,
      userId: memberId,
      role: 'admin',
      clientMutationId: newId('cmid'),
    });
    expect(res).toMatchObject({ userId: memberId, role: 'admin', changed: true });
    const roleActs = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(roleActs.some((a) => a.type === 'workspace.member_role_changed')).toBe(true);

    // Owner cannot be touched.
    await expect(
      ownerCaller.workspace.members.updateRole({
        workspaceId,
        userId: ownerId,
        role: 'admin',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      ownerCaller.workspace.members.remove({ workspaceId, userId: ownerId, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // A member can remove themselves.
    const removed = await callerFor(adminId).workspace.members.remove({
      workspaceId,
      userId: adminId,
      clientMutationId: newId('cmid'),
    });
    expect(removed).toMatchObject({ userId: adminId, removed: true });
    const after = await ownerCaller.workspace.members.list({ workspaceId });
    expect(after.some((m) => m.userId === adminId)).toBe(false);

    const removeActs = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(removeActs.some((a) => a.type === 'workspace.member_removed')).toBe(true);
  });

  it('update: requires admin+; updates name/slug and writes a workspace.updated activity', async () => {
    const slug = newSlug('renamed');
    const updated = await callerFor(ownerId).workspace.update({
      workspaceId,
      name: 'Acme Renamed',
      slug,
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ name: 'Acme Renamed', slug, changed: true });

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(acts.some((a) => a.type === 'workspace.updated')).toBe(true);
  });

  it('archive: only the owner can archive; afterwards the workspace 404s', async () => {
    // memberId was promoted to admin earlier — still not the owner.
    await expect(
      callerFor(memberId).workspace.archive({ workspaceId, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const ownerCaller = callerFor(ownerId);
    const archived = await ownerCaller.workspace.archive({ workspaceId, clientMutationId: newId('cmid') });
    expect(archived.id).toBe(workspaceId);
    expect(archived.archivedAt).toBeInstanceOf(Date);

    await expect(ownerCaller.workspace.get({ workspaceId })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const list = await ownerCaller.workspace.list();
    expect(list.some((w) => w.id === workspaceId)).toBe(false);
  });
});
