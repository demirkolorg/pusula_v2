/**
 * Integration tests for the notification-push job (Faz 6B — DEM-91).
 *
 * Hits a real Postgres (`DATABASE_URL`, via `pnpm infra:up` + `pnpm
 * db:migrate`). If no database is reachable the suite is skipped. The Expo
 * SDK is *not* required — `ExpoPushClient` is injectable and tests pass a
 * stub that records sent messages.
 *
 * Coverage:
 *  - Happy path (single token): sends one ticket, stamps outbox, bumps
 *    `last_used_at`.
 *  - Multi-token chunking: 250 tokens → 3 chunks (Expo's batch limit is 100;
 *    we don't depend on the exact value, just on chunking happening).
 *  - No active tokens: stamps outbox + skips ('no-tokens'), no SDK call.
 *  - Revoked-only tokens: filtered out — same as no-tokens.
 *  - Channel filter: rows with channel='email' / 'in_app' are skipped.
 *  - Idempotency: a second run on a stamped row is missing/no-op.
 *  - `DeviceNotRegistered` ticket → token stamped revoked.
 *  - Other ticket errors don't revoke (e.g. MessageTooBig stays active).
 *  - SDK throw → tx rollback (outbox not stamped, token state untouched).
 *  - Missing recipient (recipient_id null OR user deleted) → stamp + skip.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  notificationOutbox,
  notificationPreferences,
  notifications,
  pushTokens,
  users,
} from '@pusula/db';
import {
  createDryRunExpoClient,
  NOTIFICATION_PUSH_MAX_AGE_MS,
  NOTIFICATION_PUSH_STALE_REASON,
  processNotificationPushJob,
  type ExpoPushClient,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from './notification-push';

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
const newToken = () => `ExponentPushToken[${Math.random().toString(36).slice(2, 22)}]`;

function capturingClient(
  responder?: (msg: ExpoPushMessage) => ExpoPushTicket,
): ExpoPushClient & { sentChunks: ExpoPushMessage[][] } {
  const sentChunks: ExpoPushMessage[][] = [];
  return {
    sentChunks,
    chunkPushNotifications: (messages) => {
      const chunks: ExpoPushMessage[][] = [];
      for (let i = 0; i < messages.length; i += 100) {
        chunks.push(messages.slice(i, i + 100));
      }
      return chunks;
    },
    sendPushNotificationsAsync: async (chunk) => {
      sentChunks.push(chunk);
      return chunk.map(
        (msg): ExpoPushTicket =>
          responder ? responder(msg) : { status: 'ok', id: `t_${msg.to.slice(-6)}` },
      );
    },
    chunkPushNotificationReceiptIds: (ids) => (ids.length === 0 ? [] : [ids]),
    getPushNotificationReceiptsAsync: async () => ({}),
  };
}

function throwingClient(message = 'expo offline'): ExpoPushClient {
  return {
    chunkPushNotifications: (messages) => [messages],
    sendPushNotificationsAsync: async () => {
      throw new Error(message);
    },
    chunkPushNotificationReceiptIds: (ids) => (ids.length === 0 ? [] : [ids]),
    getPushNotificationReceiptsAsync: async () => ({}),
  };
}

const CONFIG = { appUrl: 'https://app.pusula.test' };

describe('createDryRunExpoClient', () => {
  it('returns ok tickets without calling the Expo SDK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = createDryRunExpoClient();
      const messages: ExpoPushMessage[] = [
        { to: 'ExponentPushToken[dry-run]', title: 'Title', body: 'Body' },
      ];

      const chunks = client.chunkPushNotifications(messages);
      await expect(client.sendPushNotificationsAsync(chunks[0]!)).resolves.toEqual([
        { status: 'ok', id: 'dry-run-0' },
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('dry-run'));
    } finally {
      warn.mockRestore();
    }
  });
});

describe.runIf(dbAvailable)('processNotificationPushJob (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-npu-alice');
  const bobId = newId('u-npu-bob');
  const createdUserIds = [aliceId, bobId];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  beforeEach(async () => {
    await db()
      .delete(notificationOutbox)
      .where(dbMod.inArray(notificationOutbox.recipientId, createdUserIds));
    await db().delete(pushTokens).where(dbMod.inArray(pushTokens.userId, createdUserIds));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
    await db()
      .delete(notifications)
      .where(dbMod.inArray(notifications.recipientId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(notificationOutbox)
      .where(dbMod.inArray(notificationOutbox.recipientId, createdUserIds));
    await db().delete(pushTokens).where(dbMod.inArray(pushTokens.userId, createdUserIds));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
    await db()
      .delete(notifications)
      .where(dbMod.inArray(notifications.recipientId, createdUserIds));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  async function seedOutbox(opts: {
    recipientId: string | null;
    type?: dbMod.NotificationOutboxRow['type'];
    channel?: 'in_app' | 'email' | 'push';
    payload?: Record<string, unknown>;
    inAppNotificationId?: string;
    createdAt?: Date;
  }): Promise<string> {
    const [row] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: null,
        recipientId: opts.recipientId,
        type: opts.type ?? 'card_assigned',
        channel: opts.channel ?? 'push',
        payload: opts.payload ?? {},
        inAppNotificationId: opts.inAppNotificationId ?? null,
        createdAt: opts.createdAt,
      })
      .returning({ id: notificationOutbox.id });
    return row!.id;
  }

  async function seedToken(userId: string, opts: { revoked?: boolean } = {}) {
    const token = newToken();
    await db()
      .insert(pushTokens)
      .values({
        userId,
        token,
        platform: 'ios',
        revokedAt: opts.revoked ? new Date('2020-01-01') : null,
      });
    return token;
  }

  async function readOutbox(id: string) {
    const [row] = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, id))
      .limit(1);
    return row;
  }

  async function readToken(token: string) {
    const [row] = await db()
      .select()
      .from(pushTokens)
      .where(dbMod.eq(pushTokens.token, token))
      .limit(1);
    return row;
  }

  it('happy path: sends one ticket, stamps outbox, bumps last_used_at', async () => {
    const token = await seedToken(aliceId);
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'Tasarımı bitir', cardId: 'c1', boardId: 'b1' },
    });

    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'sent', ticketCount: 1, revokedTokens: 0 });

    expect(client.sentChunks).toHaveLength(1);
    expect(client.sentChunks[0]).toHaveLength(1);
    const msg = client.sentChunks[0]![0]!;
    expect(msg.to).toBe(token);
    expect(msg.title).toBe('Yeni atama');
    expect(msg.body).toContain('Tasarımı bitir');
    expect(msg.data?.type).toBe('card_assigned');
    expect(msg.data?.cardId).toBe('c1');
    // iOS kilitli-ekran ses+uyanma garantisi (regresyon guard). `sound` artık
    // markaya özel `notification.wav` (v1.1.1 build'de app bundle'ında).
    expect(msg.sound).toBe('notification.wav');
    expect(msg.priority).toBe('high');
    expect(msg.interruptionLevel).toBe('active');
    expect(msg.ttl).toBeGreaterThan(0);
    expect(msg.ttl).toBeLessThanOrEqual(NOTIFICATION_PUSH_MAX_AGE_MS / 1_000);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
    expect(row?.status).toBe('sent');

    const tokenRow = await readToken(token);
    expect(tokenRow?.lastUsedAt).not.toBeNull();
    expect(tokenRow?.revokedAt).toBeNull();
  });

  it('drops a push older than the 15-minute freshness window', async () => {
    await seedToken(aliceId);
    const now = new Date('2026-07-22T16:00:00.000Z');
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'Eski olay' },
      createdAt: new Date(now.getTime() - NOTIFICATION_PUSH_MAX_AGE_MS - 1),
    });
    const client = capturingClient();

    const outcome = await processNotificationPushJob(
      db() as never,
      client,
      { ...CONFIG, now },
      { outboxId },
    );

    expect(outcome).toEqual({ kind: 'skipped', reason: 'stale' });
    expect(client.sentChunks).toHaveLength(0);
    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
    expect(row?.status).toBe('dead');
    expect(row?.lastError).toBe(NOTIFICATION_PUSH_STALE_REASON);
  });

  it('treats a pending row hidden by SKIP LOCKED as retryable contention', async () => {
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const locker = db().transaction(async (tx) => {
      await tx
        .select({ id: notificationOutbox.id })
        .from(notificationOutbox)
        .where(dbMod.eq(notificationOutbox.id, outboxId))
        .for('update');
      reportLocked();
      await release;
    });

    await lockHeld;
    try {
      await expect(
        processNotificationPushJob(db() as never, capturingClient(), CONFIG, { outboxId }),
      ).rejects.toThrow(/outbox is locked/);
    } finally {
      releaseLock();
      await locker;
    }
    expect((await readOutbox(outboxId))?.processedAt).toBeNull();
  });

  it('routes the linked in-app notification id onto push data.notificationId', async () => {
    // Bildirim detay / audit (2026-06-20) — publish job bu push satırına
    // bağladığı `notifications.id`'yi push `data`'ya geçirmeli (tap → detay).
    const token = await seedToken(aliceId);
    const [inApp] = await db()
      .insert(notifications)
      .values({ recipientId: aliceId, type: 'card_assigned', payload: {} })
      .returning({ id: notifications.id });
    const inAppId = inApp!.id;
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X', cardId: 'c1' },
      inAppNotificationId: inAppId,
    });

    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    const msg = client.sentChunks[0]![0]!;
    expect(msg.data?.notificationId).toBe(inAppId);
    expect(msg.to).toBe(token);
  });

  it('omits data.notificationId when the push row has no in-app link', async () => {
    await seedToken(aliceId);
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X', cardId: 'c1' },
    });
    const client = capturingClient();
    await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    const msg = client.sentChunks[0]![0]!;
    expect(msg.data?.notificationId).toBeUndefined();
  });

  it('no active tokens: stamps outbox + skips (no SDK call)', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });

    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'no-tokens' });
    expect(client.sentChunks).toHaveLength(0);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
  });

  it('revoked-only tokens are filtered out (same as no-tokens)', async () => {
    await seedToken(aliceId, { revoked: true });
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: {},
    });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('skipped');
    if (outcome.kind === 'skipped') expect(outcome.reason).toBe('no-tokens');
    expect(client.sentChunks).toHaveLength(0);
  });

  it('multi-token chunking: 250 tokens span 3 chunks', async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 250; i++) {
      tokens.push(await seedToken(aliceId));
    }
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });

    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    if (outcome.kind === 'sent') expect(outcome.ticketCount).toBe(250);
    expect(client.sentChunks).toHaveLength(3);
    expect(client.sentChunks[0]).toHaveLength(100);
    expect(client.sentChunks[1]).toHaveLength(100);
    expect(client.sentChunks[2]).toHaveLength(50);
  });

  it('channel filter: rows with channel=email are skipped', async () => {
    await seedToken(aliceId);
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      channel: 'email',
      payload: {},
    });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'missing' });
    expect(client.sentChunks).toHaveLength(0);
    // Email row stays unstamped — the email processor handles it.
    const row = await readOutbox(outboxId);
    expect(row?.processedAt).toBeNull();
  });

  it('idempotent: second run on a stamped row is missing/no-op', async () => {
    await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });

    const client1 = capturingClient();
    await processNotificationPushJob(db() as never, client1, CONFIG, { outboxId });
    expect(client1.sentChunks).toHaveLength(1);

    const client2 = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client2, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'missing' });
    expect(client2.sentChunks).toHaveLength(0);
  });

  it('DeviceNotRegistered ticket → token stamped revoked', async () => {
    const goodToken = await seedToken(aliceId);
    const badToken = await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });

    const client = capturingClient((msg) => {
      if (msg.to === badToken) {
        return {
          status: 'error',
          message: 'device not registered',
          details: { error: 'DeviceNotRegistered', expoPushToken: badToken },
        };
      }
      return { status: 'ok', id: `t_${msg.to.slice(-6)}` };
    });

    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    if (outcome.kind === 'sent') expect(outcome.revokedTokens).toBe(1);

    expect((await readToken(badToken))?.revokedAt).not.toBeNull();
    expect((await readToken(goodToken))?.revokedAt).toBeNull();
  });

  it('other ticket errors do NOT revoke (e.g. MessageTooBig)', async () => {
    const token = await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });

    const client = capturingClient(() => ({
      status: 'error',
      message: 'message too big',
      details: { error: 'MessageTooBig' },
    }));

    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    if (outcome.kind === 'sent') expect(outcome.revokedTokens).toBe(0);
    expect((await readToken(token))?.revokedAt).toBeNull();
  });

  it('SDK throw → tx rollback (outbox not stamped, token state untouched)', async () => {
    const token = await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });

    await expect(
      processNotificationPushJob(db() as never, throwingClient('expo down'), CONFIG, { outboxId }),
    ).rejects.toThrow(/expo down/);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).toBeNull();
    expect(row?.status).toBe('pending');

    // The last_used_at update is inside the same tx → rolled back too.
    const tokenRow = await readToken(token);
    expect(tokenRow?.lastUsedAt).toBeNull();
  });

  it('missing recipient (null recipient_id) → stamp + skip', async () => {
    const outboxId = await seedOutbox({ recipientId: null, payload: {} });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'no-recipient' });
    expect(client.sentChunks).toHaveLength(0);
    expect((await readOutbox(outboxId))?.processedAt).not.toBeNull();
  });

  it('user does NOT have tokens after another user revokes theirs — scoping check', async () => {
    // Bob has an active token; Alice has none. Alice's outbox must still skip.
    await seedToken(bobId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'no-tokens' });
    expect(client.sentChunks).toHaveLength(0);
  });

  // ───────────────────────────── quiet hours (Faz 10F / DEM-140)

  function windowAroundNow(): { from: string; to: string } {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const now = new Date();
    const past = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return {
      from: fmt.format(past).replace('24:', '00:'),
      to: fmt.format(future).replace('24:', '00:'),
    };
  }

  it('quiet-hours: card_assigned inside window → dead + quiet_hours_window reason', async () => {
    await seedToken(aliceId);
    const { from, to } = windowAroundNow();
    await db().insert(notificationPreferences).values({
      userId: aliceId,
      quietFrom: from,
      quietTo: to,
      quietTimezone: 'Europe/Istanbul',
    });
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'card_assigned',
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'quiet-hours' });
    expect(client.sentChunks).toHaveLength(0);

    const row = await readOutbox(outboxId);
    expect(row?.status).toBe('dead');
    expect(row?.lastError).toBe('quiet_hours_window');
  });

  it('quiet-hours: mention inside window BYPASSES suppression (sent)', async () => {
    await seedToken(aliceId);
    const { from, to } = windowAroundNow();
    await db().insert(notificationPreferences).values({
      userId: aliceId,
      quietFrom: from,
      quietTo: to,
      quietTimezone: 'Europe/Istanbul',
    });
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'mention',
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });
    const client = capturingClient();
    const outcome = await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(client.sentChunks).toHaveLength(1);
  });

  it('persists a push_receipts row per ok ticket (for receipt polling)', async () => {
    const token = await seedToken(aliceId);
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X', cardId: 'c1', boardId: 'b1' },
    });
    const client = capturingClient((msg) => ({ status: 'ok', id: `rcpt_${msg.to.slice(-6)}` }));
    await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });

    const receipts = await db()
      .select()
      .from(dbMod.pushReceipts)
      .where(dbMod.eq(dbMod.pushReceipts.outboxId, outboxId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.ticketId).toBe(`rcpt_${token.slice(-6)}`);
    expect(receipts[0]!.checkedAt).toBeNull();
    const tok = await readToken(token);
    expect(receipts[0]!.pushTokenId).toBe(tok!.id);
  });

  it('does NOT persist receipts for error tickets (DeviceNotRegistered)', async () => {
    await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    const client = capturingClient(() => ({
      status: 'error',
      message: 'gone',
      details: { error: 'DeviceNotRegistered' },
    }));
    await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });

    const receipts = await db()
      .select()
      .from(dbMod.pushReceipts)
      .where(dbMod.eq(dbMod.pushReceipts.outboxId, outboxId));
    expect(receipts).toHaveLength(0);
  });

  it('does NOT persist receipts in dry-run mode', async () => {
    await seedToken(aliceId);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    const client = capturingClient();
    await processNotificationPushJob(
      db() as never,
      client,
      { ...CONFIG, dryRun: true },
      { outboxId },
    );

    const receipts = await db()
      .select()
      .from(dbMod.pushReceipts)
      .where(dbMod.eq(dbMod.pushReceipts.outboxId, outboxId));
    expect(receipts).toHaveLength(0);
  });

  it('sends the unread count as the iOS app-icon badge', async () => {
    await seedToken(aliceId);
    // Two unread in-app notifications already exist for alice.
    await db()
      .insert(notifications)
      .values([
        { recipientId: aliceId, type: 'card_assigned', payload: {} },
        { recipientId: aliceId, type: 'mention', payload: {} },
      ]);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    const client = capturingClient();
    await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });

    const msg = client.sentChunks[0]![0]!;
    expect(msg.badge).toBe(2);
  });

  it('badge counts only the recipient unread rows, ignoring read + other users', async () => {
    await seedToken(aliceId);
    await db()
      .insert(notifications)
      .values([
        { recipientId: aliceId, type: 'card_assigned', payload: {} },
        { recipientId: aliceId, type: 'mention', payload: {}, readAt: new Date() },
        { recipientId: bobId, type: 'card_assigned', payload: {} },
      ]);
    const outboxId = await seedOutbox({ recipientId: aliceId, payload: {} });
    const client = capturingClient();
    await processNotificationPushJob(db() as never, client, CONFIG, { outboxId });

    // alice has 1 unread (the read row + bob's row excluded).
    expect(client.sentChunks[0]![0]!.badge).toBe(1);
  });
});
