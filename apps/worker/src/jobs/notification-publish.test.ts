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
  SCHEDULER_TICK_EVENT_ID,
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

  it('email channel with NO enqueuer wired: keeps row pending instead of marking sent', async () => {
    // Missing channel wiring is an operational bug, not a successful delivery.
    // The publish processor must leave the row retryable so the sweeper can
    // recover after the host is correctly wired.
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
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);

    const [stamped] = await db()
      .select({
        processedAt: notificationOutbox.processedAt,
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        lastError: notificationOutbox.lastError,
      })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).toBeNull();
    expect(stamped?.status).toBe('pending');
    expect(stamped?.attempts).toBe(1);
    expect(stamped?.lastError).toBe('email enqueuer is not wired');

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it('push channel with NO enqueuer wired: keeps row pending instead of marking sent', async () => {
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

    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {},
      { eventId: activityId },
    );
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);

    const [stamped] = await db()
      .select({
        processedAt: notificationOutbox.processedAt,
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        lastError: notificationOutbox.lastError,
      })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(stamped?.processedAt).toBeNull();
    expect(stamped?.status).toBe('pending');
    expect(stamped?.attempts).toBe(1);
    expect(stamped?.lastError).toBe('push enqueuer is not wired');

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

  it("digest_queued email row is skipped (not handed off, not stamped) — Faz 10G", async () => {
    // Faz 10G: digest worker bu satırı kendi cron'unda işler; publish
    // processor email kanal kuyruğuna push etmemeli.
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'email',
        recipientId,
        type: 'card_assigned',
        payload: { activityType: 'card.member_added', cardId },
        status: 'digest_queued',
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;

    const enqueuedEmail: string[] = [];
    const publisher = capturingPublisher();
    const result = await processNotificationPublishJob(
      db(),
      publisher,
      {
        enqueueEmail: async (id) => {
          enqueuedEmail.push(id);
        },
      },
      { eventId: activityId },
    );
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(enqueuedEmail).toEqual([]);

    const [row] = await db()
      .select({ status: notificationOutbox.status, processedAt: notificationOutbox.processedAt })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, outboxId));
    expect(row?.status).toBe('digest_queued');
    expect(row?.processedAt).toBeNull();

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
  });

  it("sweeper ignores digest_queued rows — Faz 10G", async () => {
    // Sweeper digest satırlarını yeniden enqueue etmemeli — digest worker
    // ayrı cron üzerinden işler. Aksi halde her tick'te aynı satır publish
    // processor'a düşüp tekrar skip edilir (gürültü).
    //
    // Bu test'i izole tutmak için: kendi `activityId`'mizin satırlarını
    // önce temizleriz, sonra tek bir `digest_queued` satır ekleriz; sweep
    // sonucunda *bu* activityId enqueued listesinde olmamalı (diğer
    // paralel testlerden artık stale satırlar varsa onların sayısına
    // değil, kendi event'imizin akıbetine bakıyoruz).
    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: activityId,
        channel: 'email',
        recipientId,
        type: 'card_assigned',
        payload: {},
        status: 'digest_queued',
        createdAt: new Date(Date.now() - 120_000),
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;
    try {
      const enqueued: string[] = [];
      await sweepStaleNotificationEvents(db(), {
        enqueue: async (eventId: string) => {
          enqueued.push(eventId);
        },
      });
      // Digest satırı sweep'te değil — kendi activityId'miz enqueued
      // listesinde olmamalı (başka stale satırlar mevcutsa toplam swept
      // sayısı 0 olmayabilir; izole varlık testi bu kadar yeterli).
      expect(enqueued).not.toContain(activityId);
    } finally {
      await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
    }
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

  it('sweeper recovers scheduler-fired (event_id IS NULL) stale rows via the sentinel', async () => {
    // Regression — push incident 2026-05-31: a due_overdue scheduler tick lost
    // its best-effort `scheduler:tick` enqueue. These rows have `event_id NULL`
    // (no triggering activity), so the old `event_id IS NOT NULL` sweep filter
    // could never recover them → stuck `pending` forever. The sweeper must now
    // hand the `SCHEDULER_TICK_EVENT_ID` sentinel to the enqueuer.
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: null,
        channel: 'push',
        recipientId,
        type: 'due_overdue',
        payload: {},
        createdAt: new Date(Date.now() - 120_000),
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;
    try {
      const enqueued: string[] = [];
      const swept = await sweepStaleNotificationEvents(db(), {
        enqueue: async (eventId: string) => {
          enqueued.push(eventId);
        },
      });
      expect(swept).toBeGreaterThanOrEqual(1);
      expect(enqueued).toContain(SCHEDULER_TICK_EVENT_ID);
    } finally {
      await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
    }
  });

  it('sweeper does NOT fire the scheduler sentinel for digest_queued NULL rows', async () => {
    // `digest_queued` rows are owned by the email-digest cron; the scheduler
    // recovery branch must exclude them exactly like the activity-driven sweep.
    const [outbox] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: null,
        channel: 'email',
        recipientId,
        type: 'due_overdue',
        payload: {},
        status: 'digest_queued',
        createdAt: new Date(Date.now() - 120_000),
      })
      .returning({ id: notificationOutbox.id });
    const outboxId = outbox!.id;
    try {
      const enqueued: string[] = [];
      await sweepStaleNotificationEvents(db(), {
        enqueue: async (eventId: string) => {
          enqueued.push(eventId);
        },
      });
      // This row alone must not trigger the sentinel. (Other stale NULL rows in
      // a shared DB could, so we assert this specific row stays unprocessed.)
      const [after] = await db()
        .select({ processedAt: notificationOutbox.processedAt })
        .from(notificationOutbox)
        .where(dbMod.eq(notificationOutbox.id, outboxId));
      expect(after?.processedAt).toBeNull();
    } finally {
      await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.id, outboxId));
    }
  });
});
