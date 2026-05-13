/**
 * Integration tests for the Phase 4A (DEM-78) `clientMutationId` propagation —
 * the bridge between client input and `activity_events.payload`. The contract:
 *
 *  - Every board / list / card collaborative procedure accepts an optional
 *    `clientMutationId` on input (UUID format, validated by `@pusula/domain`).
 *  - When supplied, the value is folded into the `activity_events.payload`
 *    written by that mutation (so Phase 5 realtime echo can filter it out).
 *  - When omitted, the row is still written but carries no `clientMutationId`
 *    on the payload — the schema explicitly accepts omission.
 *  - A malformed `clientMutationId` (non-UUID string) is rejected at input
 *    validation (`BAD_REQUEST` from Zod) — the procedure body never runs.
 *
 * Spans three routers (board / list / card) and several activity types so a
 * regression in one branch doesn't pass unnoticed. Requires a real Postgres —
 * the suite is skipped on a box without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
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

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-cmid-owner');
const memberId = newId('u-cmid-member');
const createdUserIds = [ownerId, memberId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('clientMutationId propagation (Phase 4A — DEM-78)', () => {
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
      name: 'Cmid Co',
      slug: newSlug('cmid-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([{ workspaceId, userId: memberId, role: 'member' }]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Cmid Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: memberId, role: 'member' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Cmid List',
      clientMutationId: crypto.randomUUID(),
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

  it('card.create folds the clientMutationId into the activity payload', async () => {
    const cmid = crypto.randomUUID();
    const created = await callerFor(memberId).card.create({
      listId,
      title: 'cmid-create',
      clientMutationId: cmid,
    });
    const [act] = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.cardId, created.id),
          dbMod.eq(activityEvents.type, 'card.created'),
        )!,
      )
      .limit(1);
    expect(act).toBeDefined();
    expect((act!.payload as { clientMutationId?: string }).clientMutationId).toBe(cmid);
  });

  it('omitting clientMutationId still writes the activity (no clientMutationId key on payload)', async () => {
    const created = await callerFor(memberId).card.create({
      listId,
      title: 'cmid-omit',
    });
    const [act] = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.cardId, created.id),
          dbMod.eq(activityEvents.type, 'card.created'),
        )!,
      )
      .limit(1);
    expect(act).toBeDefined();
    // `undefined` is stripped by JSON serialisation — the key is absent on disk.
    expect((act!.payload as Record<string, unknown>).clientMutationId).toBeUndefined();
    expect('clientMutationId' in (act!.payload as object)).toBe(false);
  });

  it('rejects a malformed clientMutationId at Zod input validation', async () => {
    await expect(
      callerFor(memberId).card.create({
        listId,
        title: 'cmid-bad',
        // The schema accepts any string at the TS layer; Zod's `.uuid()`
        // refinement runs at runtime and rejects the malformed value.
        clientMutationId: 'cmid_legacy-not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('list.create folds the clientMutationId into list.created activity', async () => {
    const cmid = crypto.randomUUID();
    const list = await callerFor(memberId).list.create({
      boardId,
      title: 'cmid-list',
      clientMutationId: cmid,
    });
    const [act] = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.boardId, boardId),
          dbMod.eq(activityEvents.type, 'list.created'),
          dbMod.sql`(${activityEvents.payload}->>'listId') = ${list.id}`,
        )!,
      )
      .limit(1);
    expect(act).toBeDefined();
    expect((act!.payload as { clientMutationId?: string }).clientMutationId).toBe(cmid);
  });

  it('board.update folds the clientMutationId into board.renamed activity', async () => {
    const cmid = crypto.randomUUID();
    await callerFor(ownerId).board.update({
      boardId,
      title: `Cmid Board ${Math.random().toString(36).slice(2, 8)}`,
      clientMutationId: cmid,
    });
    const acts = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.boardId, boardId),
          dbMod.eq(activityEvents.type, 'board.renamed'),
        )!,
      )
      .orderBy(dbMod.desc(activityEvents.createdAt))
      .limit(1);
    expect(acts).toHaveLength(1);
    expect((acts[0]!.payload as { clientMutationId?: string }).clientMutationId).toBe(cmid);
  });

  it('card.update title change folds the clientMutationId into card.renamed activity', async () => {
    const created = await callerFor(memberId).card.create({
      listId,
      title: 'cmid-rename-src',
    });
    const cmid = crypto.randomUUID();
    await callerFor(memberId).card.update({
      cardId: created.id,
      title: 'cmid-rename-dst',
      clientMutationId: cmid,
    });
    const [act] = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.cardId, created.id),
          dbMod.eq(activityEvents.type, 'card.renamed'),
        )!,
      )
      .limit(1);
    expect(act).toBeDefined();
    expect((act!.payload as { clientMutationId?: string }).clientMutationId).toBe(cmid);
  });
});
