/**
 * Integration tests for the Expo push receipt poller (push-receipt-polling).
 *
 * Hits a real Postgres (`DATABASE_URL`); skipped when unreachable. The Expo
 * SDK is not required — `ExpoPushClient` is injectable and tests pass a stub
 * that returns a fixed receipt map.
 *
 * Coverage:
 *  - `ok` receipt           → row stamped `checked_at`, token stays active.
 *  - `DeviceNotRegistered`  → token revoked + row stamped.
 *  - other delivery error   → row stamped, token stays active (logged).
 *  - missing verdict        → row left `checked_at IS NULL` for next tick.
 *  - settle window          → a too-young receipt is not fetched at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { pushReceipts, pushTokens, users } from '@pusula/db';
import { sweepPushReceipts } from './notification-push-receipts';
import type { ExpoPushClient, ExpoPushReceipt } from './notification-push';

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

/** Stub client whose receipt map is keyed by ticket id (missing key = not ready). */
function receiptClient(map: Record<string, ExpoPushReceipt>): ExpoPushClient {
  return {
    chunkPushNotifications: (m) => (m.length === 0 ? [] : [m]),
    sendPushNotificationsAsync: async () => [],
    chunkPushNotificationReceiptIds: (ids) => (ids.length === 0 ? [] : [ids]),
    getPushNotificationReceiptsAsync: async (ids) => {
      const out: Record<string, ExpoPushReceipt> = {};
      for (const id of ids) {
        if (map[id]) out[id] = map[id];
      }
      return out;
    },
  };
}

describe.runIf(dbAvailable)('sweepPushReceipts (integration)', () => {
  const db = () => probe!.db;
  const userId = newId('u-rcpt');

  beforeAll(async () => {
    await db().insert(users).values({ id: userId, name: userId, email: `${userId}@example.test` });
  });

  beforeEach(async () => {
    await db().delete(pushTokens).where(dbMod.eq(pushTokens.userId, userId));
    // push_receipts cascade-delete with their token, but be explicit for rows
    // whose token was already removed in a prior test.
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(pushTokens).where(dbMod.eq(pushTokens.userId, userId));
    await db().delete(users).where(dbMod.eq(users.id, userId));
    await probe.pool.end();
  });

  async function seedToken(opts: { revoked?: boolean } = {}) {
    const token = newToken();
    const [row] = await db()
      .insert(pushTokens)
      .values({
        userId,
        token,
        platform: 'ios',
        revokedAt: opts.revoked ? new Date('2020-01-01') : null,
      })
      .returning({ id: pushTokens.id });
    return { id: row!.id, token };
  }

  async function seedReceipt(pushTokenId: string, ticketId: string, ageMs = 120_000) {
    const [row] = await db()
      .insert(pushReceipts)
      .values({
        ticketId,
        pushTokenId,
        createdAt: new Date(Date.now() - ageMs),
      })
      .returning({ id: pushReceipts.id });
    return row!.id;
  }

  async function readReceipt(id: string) {
    const [row] = await db()
      .select()
      .from(pushReceipts)
      .where(dbMod.eq(pushReceipts.id, id))
      .limit(1);
    return row;
  }

  async function readToken(id: string) {
    const [row] = await db()
      .select()
      .from(pushTokens)
      .where(dbMod.eq(pushTokens.id, id))
      .limit(1);
    return row;
  }

  it('ok receipt: stamps checked_at, leaves token active', async () => {
    const tok = await seedToken();
    const receiptId = await seedReceipt(tok.id, 'tk-ok');
    const result = await sweepPushReceipts(db() as never, receiptClient({ 'tk-ok': { status: 'ok' } }));

    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.revokedTokens).toBe(0);
    expect((await readReceipt(receiptId))?.checkedAt).not.toBeNull();
    expect((await readToken(tok.id))?.revokedAt).toBeNull();
  });

  it('DeviceNotRegistered: revokes the token + stamps checked_at', async () => {
    const tok = await seedToken();
    const receiptId = await seedReceipt(tok.id, 'tk-dead');
    const result = await sweepPushReceipts(
      db() as never,
      receiptClient({
        'tk-dead': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      }),
    );

    expect(result.revokedTokens).toBe(1);
    expect((await readReceipt(receiptId))?.checkedAt).not.toBeNull();
    expect((await readToken(tok.id))?.revokedAt).not.toBeNull();
  });

  it('other delivery error: stamps checked_at, token stays active', async () => {
    const tok = await seedToken();
    const receiptId = await seedReceipt(tok.id, 'tk-big');
    const result = await sweepPushReceipts(
      db() as never,
      receiptClient({
        'tk-big': { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      }),
    );

    expect(result.deliveryErrors).toBe(1);
    expect(result.revokedTokens).toBe(0);
    expect((await readReceipt(receiptId))?.checkedAt).not.toBeNull();
    expect((await readToken(tok.id))?.revokedAt).toBeNull();
  });

  it('missing verdict (not ready): leaves the row unchecked for the next tick', async () => {
    const tok = await seedToken();
    const receiptId = await seedReceipt(tok.id, 'tk-pending');
    // Empty receipt map → Expo has no verdict yet.
    await sweepPushReceipts(db() as never, receiptClient({}));

    expect((await readReceipt(receiptId))?.checkedAt).toBeNull();
  });

  it('expires a receipt past the retention window when Expo has no verdict', async () => {
    const tok = await seedToken();
    // 25h old + empty receipt map → Expo no longer holds it → give up.
    const receiptId = await seedReceipt(tok.id, 'tk-expired', 25 * 3_600_000);
    const result = await sweepPushReceipts(db() as never, receiptClient({}));

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await readReceipt(receiptId))?.checkedAt).not.toBeNull();
    expect((await readToken(tok.id))?.revokedAt).toBeNull();
  });

  it('settle window: a too-young receipt is not fetched', async () => {
    const tok = await seedToken();
    // Age 0 → inside the 60 s settle window, must be excluded from the sweep.
    const receiptId = await seedReceipt(tok.id, 'tk-young', 0);
    let askedFor: string[] = [];
    const client: ExpoPushClient = {
      chunkPushNotifications: (m) => (m.length === 0 ? [] : [m]),
      sendPushNotificationsAsync: async () => [],
      chunkPushNotificationReceiptIds: (ids) => (ids.length === 0 ? [] : [ids]),
      getPushNotificationReceiptsAsync: async (ids) => {
        askedFor = ids;
        return {};
      },
    };
    await sweepPushReceipts(db() as never, client);

    expect(askedFor).not.toContain('tk-young');
    expect((await readReceipt(receiptId))?.checkedAt).toBeNull();
  });
});
