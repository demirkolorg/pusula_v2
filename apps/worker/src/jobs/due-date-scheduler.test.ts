/**
 * Integration tests for the due-date scheduler (Faz 6A — DEM-90). Skips on a
 * box without Postgres. We control time via the `now` parameter, so the same
 * suite covers each reminder tier deterministically.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  boards,
  cardMembers,
  cards,
  lists,
  notificationOutbox,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { runDueDateScheduler } from './due-date-scheduler';

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

describe.runIf(dbAvailable)('runDueDateScheduler (integration)', () => {
  const db = () => probe!.db;
  const actorId = newId('u-ds-actor');
  const watcherId = newId('u-ds-watcher');
  const createdUserIds = [actorId, watcherId];
  let workspaceId: string;
  let boardId: string;
  let listId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    workspaceId = newId('ws-ds');
    boardId = newId('b-ds');
    listId = newId('l-ds');
    await db().insert(workspaces).values({
      id: workspaceId,
      name: 'DS WS',
      slug: workspaceId,
      ownerId: actorId,
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: actorId, role: 'owner' },
        { workspaceId, userId: watcherId, role: 'member' },
      ]);
    await db().insert(boards).values({ id: boardId, workspaceId, title: 'DS Board' });
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: actorId, role: 'admin' },
        { boardId, userId: watcherId, role: 'member' },
      ]);
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
  });

  afterAll(async () => {
    if (!probe) return;
    // Scheduler rows live with `event_id IS NULL` and a `dedupeKey` payload.
    // Earlier drafts of this test relied on the long-gone `event_id LIKE
    // 'due:%'` filter, which never matched anything.
    await db().delete(notificationOutbox).where(
      dbMod.sql`${notificationOutbox.eventId} IS NULL AND ${notificationOutbox.payload} ? 'dedupeKey'`,
    );
    await db().delete(cardMembers).where(
      dbMod.inArray(cardMembers.userId, createdUserIds),
    );
    await db().delete(cards).where(dbMod.eq(cards.boardId, boardId));
    await db().delete(lists).where(dbMod.eq(lists.boardId, boardId));
    await db().delete(boards).where(dbMod.eq(boards.id, boardId));
    await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  async function seedCard(dueAt: Date, position: string) {
    const cardId = newId('c-ds');
    await db().insert(cards).values({ id: cardId, boardId, listId, title: 'Due card', position, dueAt });
    await db().insert(cardMembers).values({ cardId, userId: watcherId, role: 'watcher' });
    return cardId;
  }

  it('classifies due-overdue and writes one outbox row per (card, tier)', async () => {
    const now = new Date('2026-05-13T10:00:00Z');
    const overdueAt = new Date(now.getTime() - 60_000);
    const cardId = await seedCard(overdueAt, 'a0');
    try {
      const enqueued: string[] = [];
      const result = await runDueDateScheduler(
        db(),
        async (eventId) => {
          enqueued.push(eventId);
        },
        now,
      );
      expect(result.scanned).toBeGreaterThanOrEqual(1);
      expect(result.written).toBeGreaterThanOrEqual(1);
      // Scheduler batches every fresh row under a single sentinel job.
      expect(enqueued).toContain('scheduler:tick');

      // Outbox row: keyed by payload.dedupeKey (event_id is NULL — no
      // activity_events row for a scheduler-fired reminder).
      const rows = await db()
        .select({ type: notificationOutbox.type, channel: notificationOutbox.channel })
        .from(notificationOutbox)
        .where(dbMod.sql`${notificationOutbox.payload}->>'dedupeKey' = ${`due:due_overdue:${cardId}`}`);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((r) => r.type === 'due_overdue')).toBe(true);
    } finally {
      await db().delete(notificationOutbox).where(
        dbMod.sql`${notificationOutbox.payload}->>'dedupeKey' = ${`due:due_overdue:${cardId}`}`,
      );
      await db().delete(cardMembers).where(dbMod.eq(cardMembers.cardId, cardId));
      await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    }
  });

  it('dedupes — a second tick on the same (card, tier) does nothing', async () => {
    const now = new Date('2026-05-13T10:00:00Z');
    const dueIn30Min = new Date(now.getTime() + 30 * 60_000);
    const cardId = await seedCard(dueIn30Min, 'a1');
    try {
      const first = await runDueDateScheduler(db(), async () => {}, now);
      expect(first.written).toBeGreaterThanOrEqual(1);
      const second = await runDueDateScheduler(db(), async () => {}, now);
      // No new card/tier combos → written must drop to 0 (existing rows already
      // marked the (card, 1h) tier).
      expect(second.written).toBe(0);
    } finally {
      await db().delete(notificationOutbox).where(
        dbMod.sql`${notificationOutbox.payload}->>'dedupeKey' = ${`due:due_reminder_1h:${cardId}`}`,
      );
      await db().delete(cardMembers).where(dbMod.eq(cardMembers.cardId, cardId));
      await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    }
  });

  it('ignores cards far in the future (> 24 h)', async () => {
    const now = new Date('2026-05-13T10:00:00Z');
    const dueIn3Days = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
    const cardId = await seedCard(dueIn3Days, 'a2');
    try {
      const result = await runDueDateScheduler(db(), async () => {}, now);
      expect(result.written).toBe(0);
    } finally {
      await db().delete(cardMembers).where(dbMod.eq(cardMembers.cardId, cardId));
      await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    }
  });
});
