/**
 * Integration tests for the notifications router (Faz 6A / DEM-90). Same DB
 * probe pattern as the rest of `packages/api` — skip on a box without infra.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { notifications, users } from '@pusula/db';
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

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });
function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('notifications router (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-nrt-alice');
  const bobId = newId('u-nrt-bob');
  const createdUserIds = [aliceId, bobId];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  beforeEach(async () => {
    // Each test starts with an empty notifications table for the two users.
    await db()
      .delete(notifications)
      .where(dbMod.inArray(notifications.recipientId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(notifications)
      .where(dbMod.inArray(notifications.recipientId, createdUserIds));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  // Seed N notifications for `userId` with monotonically increasing
  // `created_at` so the order is deterministic. Returns the inserted ids in
  // *creation order* (oldest first).
  async function seed(userId: string, count: number, type: 'card_assigned' | 'comment_reply' = 'card_assigned') {
    const base = Date.now() - count * 1_000;
    const rows: { id: string; createdAt: Date }[] = [];
    for (let i = 0; i < count; i++) {
      const [r] = await db()
        .insert(notifications)
        .values({
          recipientId: userId,
          actorId: null,
          type,
          payload: { i },
          createdAt: new Date(base + i * 1_000),
        })
        .returning({ id: notifications.id, createdAt: notifications.createdAt });
      rows.push(r!);
    }
    return rows;
  }

  it('list returns the caller’s notifications, newest first, with cursor pagination', async () => {
    const seeded = await seed(aliceId, 5);
    const newestFirst = [...seeded].reverse();

    const page1 = await callerFor(aliceId).notifications.list({ limit: 2 });
    expect(page1.items.map((i) => i.id)).toEqual([newestFirst[0]!.id, newestFirst[1]!.id]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await callerFor(aliceId).notifications.list({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.id)).toEqual([newestFirst[2]!.id, newestFirst[3]!.id]);

    const page3 = await callerFor(aliceId).notifications.list({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.items.map((i) => i.id)).toEqual([newestFirst[4]!.id]);
    expect(page3.nextCursor).toBeNull();
  });

  it('list scopes to the caller — Bob never sees Alice’s rows', async () => {
    await seed(aliceId, 3);
    const bobResult = await callerFor(bobId).notifications.list({ limit: 10 });
    expect(bobResult.items).toEqual([]);
  });

  it('unreadCount counts only unread rows for the caller', async () => {
    const rows = await seed(aliceId, 3);
    // Mark one row read directly via DB.
    await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(dbMod.eq(notifications.id, rows[0]!.id));
    const result = await callerFor(aliceId).notifications.unreadCount();
    expect(result.count).toBe(2);
  });

  it('markRead flips read_at for the caller’s row, idempotent on second call', async () => {
    const [row] = await seed(aliceId, 1);
    const first = await callerFor(aliceId).notifications.markRead({ id: row!.id });
    expect(first.changed).toBe(true);
    expect(first.readAt).not.toBeNull();

    const second = await callerFor(aliceId).notifications.markRead({ id: row!.id });
    expect(second.changed).toBe(false);
    // Same row id, second call returns the existing readAt unchanged.
    expect(second.id).toBe(row!.id);
  });

  it('markRead on someone else’s row → NOT_FOUND (no info leak)', async () => {
    const [row] = await seed(aliceId, 1);
    await expect(callerFor(bobId).notifications.markRead({ id: row!.id })).rejects.toThrowError(
      /Bildirim bulunamadı/,
    );
  });

  it('markAllRead bulk-marks every unread row for the caller; idempotent on second call', async () => {
    await seed(aliceId, 4);
    const first = await callerFor(aliceId).notifications.markAllRead();
    expect(first.marked).toBe(4);
    const second = await callerFor(aliceId).notifications.markAllRead();
    expect(second.marked).toBe(0);
    const count = await callerFor(aliceId).notifications.unreadCount();
    expect(count.count).toBe(0);
  });

  it('list({ unread: true }) filters to unread only', async () => {
    const rows = await seed(aliceId, 3);
    await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(dbMod.eq(notifications.id, rows[0]!.id));
    const result = await callerFor(aliceId).notifications.list({ limit: 10, unread: true });
    // 2 unread rows; the read row (rows[0]) is excluded.
    expect(result.items.map((i) => i.id).sort()).toEqual([rows[1]!.id, rows[2]!.id].sort());
  });
});
