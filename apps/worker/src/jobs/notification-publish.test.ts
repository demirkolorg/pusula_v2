/**
 * Integration tests for the notification-publish job + sweeper (Faz 6A —
 * DEM-90). Same Postgres-probe pattern as `realtime-publish.test.ts` — skip
 * on a box without infra. Redis is mocked via an injectable publisher.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  boards,
  cardMembers,
  cards,
  lists,
  notificationOutbox,
  notifications,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  NOTIFICATION_USER_CHANNEL,
  processNotificationPublishJob,
  type NotificationUserMessage,
} from './notification-publish';
import { sweepStaleNotificationEvents } from './notification-publish-sweeper';

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

function capturingPublisher() {
  const calls: Array<{ channel: string; message: NotificationUserMessage }> = [];
  const publish = async (channel: string, raw: string) => {
    calls.push({ channel, message: JSON.parse(raw) as NotificationUserMessage });
    return 1;
  };
  return { publish, calls };
}

describe.runIf(dbAvailable)('processNotificationPublishJob (integration)', () => {
  const db = () => probe!.db;

  const actorId = newId('u-np-actor');
  const recipientId = newId('u-np-recipient');
  const createdUserIds = [actorId, recipientId];
  let workspaceId: string;
  let boardId: string;
  let cardId: string;
  let activityId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    workspaceId = newId('ws-np');
    boardId = newId('b-np');
    const listId = newId('l-np');
    cardId = newId('c-np');
    await db().insert(workspaces).values({
      id: workspaceId,
      name: 'NP WS',
      slug: workspaceId,
      ownerId: actorId,
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: actorId, role: 'owner' },
        { workspaceId, userId: recipientId, role: 'member' },
      ]);
    await db().insert(boards).values({ id: boardId, workspaceId, title: 'NP Board' });
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: actorId, role: 'admin' },
        { boardId, userId: recipientId, role: 'member' },
      ]);
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    await db().insert(cards).values({ id: cardId, boardId, listId, title: 'C', position: 'a0' });
    const [row] = await db()
      .insert(activityEvents)
      .values({
        workspaceId,
        boardId,
        cardId,
        actorId,
        type: 'card.member_added',
        payload: { cardId, userId: recipientId, role: 'assignee' },
      })
      .returning({ id: activityEvents.id });
    activityId = row!.id;
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(notifications).where(dbMod.eq(notifications.recipientId, recipientId));
    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db().delete(activityEvents).where(dbMod.eq(activityEvents.id, activityId));
    await db().delete(cardMembers).where(dbMod.eq(cardMembers.cardId, cardId));
    await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    await db().delete(lists).where(dbMod.eq(lists.boardId, boardId));
    await db().delete(boards).where(dbMod.eq(boards.id, boardId));
    await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  it('processes pending in_app rows: writes `notifications`, publishes user message, stamps processed_at', async () => {
    // Seed an in_app outbox row directly (sidesteps the rule engine — we're
    // testing the worker's fan-out, not the rules).
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'in_app',
        recipientId,
        type: 'card_assigned',
        payload: { activityType: 'card.member_added', cardId, notificationType: 'card_assigned' },
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {},
      { eventId: activityId },
    );
    expect(result.processed).toBe(1);

    // `notifications` row created for the recipient.
    const inserted = await db()
      .select({
        id: notifications.id,
        recipientId: notifications.recipientId,
        type: notifications.type,
      })
      .from(notifications)
      .where(dbMod.eq(notifications.recipientId, recipientId));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.type).toBe('card_assigned');

    // Outbox row stamped.
    const [stamped] = await db()
      .select({ processedAt: notificationOutbox.processedAt, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).not.toBeNull();
    expect(stamped?.status).toBe('sent');

    // Pub/sub badge message captured.
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0]?.channel).toBe(NOTIFICATION_USER_CHANNEL);
    expect(publisher.calls[0]?.message.userId).toBe(recipientId);
    expect(publisher.calls[0]?.message.notificationType).toBe('card_assigned');

    // Cleanup so the next test is independent.
    await db().delete(notifications).where(dbMod.eq(notifications.recipientId, recipientId));
    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('idempotent re-run on the same eventId is a no-op (rows are already processed)', async () => {
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'in_app',
        recipientId,
        type: 'card_assigned',
        payload: {},
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const publisher = capturingPublisher();
    const first = await processNotificationPublishJob(db(), publisher, {}, { eventId: activityId });
    expect(first.processed).toBe(1);

    const second = await processNotificationPublishJob(
      db(),
      publisher,
      {},
      { eventId: activityId },
    );
    expect(second.processed).toBe(0);

    // Only one notifications row, one publish call.
    const inserted = await db()
      .select({ id: notifications.id })
      .from(notifications)
      .where(dbMod.eq(notifications.recipientId, recipientId));
    expect(inserted).toHaveLength(1);
    expect(publisher.calls).toHaveLength(1);

    await db().delete(notifications).where(dbMod.eq(notifications.recipientId, recipientId));
    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  // Faz 6B (DEM-91) — 6A→6B handoff: when an email/push enqueuer is wired,
  // the publish processor must NOT stamp `processed_at` (the 6B channel
  // processor stamps after sending). The `processed` count still increments
  // because the row was successfully handed off.
  it('email channel with wired enqueuer: hands off without stamping (6B handoff)', async () => {
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'email',
        recipientId,
        type: 'card_assigned',
        payload: { activityType: 'card.member_added', cardId },
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const enqueuedEmail: string[] = [];
    const enqueuedPush: string[] = [];
    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {
        enqueueEmail: async (id) => {
          enqueuedEmail.push(id);
        },
        enqueuePush: async (id) => {
          enqueuedPush.push(id);
        },
      },
      { eventId: activityId },
    );
    expect(result.processed).toBe(1);
    expect(enqueuedEmail).toEqual([outboxId]);
    expect(enqueuedPush).toEqual([]);
    // No in-app side effects.
    expect(publisher.calls).toHaveLength(0);

    // Critical: the row is NOT stamped — the 6B email processor stamps after
    // sending. The sweeper sees the row as still pending; that's fine because
    // BullMQ's `jobId: 'email-{outboxId}'` debounces the re-enqueue.
    const [stamped] = await db()
      .select({ processedAt: notificationOutbox.processedAt, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).toBeNull();
    expect(stamped?.status).toBe('pending');

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('push channel with wired enqueuer: hands off without stamping (6B handoff)', async () => {
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'push',
        recipientId,
        type: 'card_assigned',
        payload: {},
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const enqueuedPush: string[] = [];
    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {
        enqueuePush: async (id) => {
          enqueuedPush.push(id);
        },
      },
      { eventId: activityId },
    );
    expect(result.processed).toBe(1);
    expect(enqueuedPush).toEqual([outboxId]);
    expect(publisher.calls).toHaveLength(0);

    const [stamped] = await db()
      .select({ processedAt: notificationOutbox.processedAt })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).toBeNull();

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('email channel with NO enqueuer wired (pre-6B host): falls through to stamp', async () => {
    // Mirrors the case of a Faz 6B-less worker host (dev box / migration
    // window). The processor stamps the row 'sent' so the sweeper doesn't
    // keep re-picking it; the email body is lost, but that's only on a host
    // that never had a 6B consumer running.
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'email',
        recipientId,
        type: 'card_assigned',
        payload: {},
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {},
      { eventId: activityId },
    );
    expect(result.processed).toBe(1);

    const [stamped] = await db()
      .select({ processedAt: notificationOutbox.processedAt, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).not.toBeNull();
    expect(stamped?.status).toBe('sent');

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('email channel enqueuer throws: row stays pending so the sweeper can retry', async () => {
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'email',
        recipientId,
        type: 'card_assigned',
        payload: {},
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {
        enqueueEmail: async () => {
          throw new Error('queue temporarily unavailable');
        },
      },
      { eventId: activityId },
    );
    // The throw is caught inside `dispatchOutboxRow` → row counted as
    // skipped (not delivered, not enqueued). The processed counter stays 0.
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);

    const [stamped] = await db()
      .select({ processedAt: notificationOutbox.processedAt, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    // Row stays pending — sweeper will re-enqueue after the 30 s grace.
    expect(stamped?.processedAt).toBeNull();
    expect(stamped?.status).toBe('pending');

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('sweeper re-enqueues stale pending events', async () => {
    // Seed a row that's already > 30 s old (we lie about its `created_at`).
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'in_app',
        recipientId,
        type: 'card_assigned',
        payload: {},
        createdAt: new Date(Date.now() - 120_000),
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;
    try {
      const enqueued: string[] = [];
      const enqueuer = {
        enqueue: async (eventId: string) => {
          enqueued.push(eventId);
        },
      };
      const swept = await sweepStaleNotificationEvents(db(), enqueuer);
      expect(swept).toBeGreaterThanOrEqual(1);
      expect(enqueued).toContain(activityId);
    } finally {
      await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
    }
  });
});
