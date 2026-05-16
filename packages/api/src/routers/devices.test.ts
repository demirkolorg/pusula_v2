/**
 * Integration tests for `auth.devices.list` + `auth.devices.revoke`
 * (Faz 10I / DEM-143). Mirrors the `push-tokens-list.test.ts` skeleton:
 * uses a real Postgres only when one is available locally, otherwise the
 * suite is skipped via `describe.runIf(dbAvailable)`.
 *
 * Coverage:
 *   - empty caller returns empty list
 *   - list returns the caller's own devices in `last_seen_at DESC` order
 *   - `isCurrent` reflects (UA hash + IP /24 subnet) match against the
 *     request context
 *   - cross-user isolation (Bob can't see Alice's devices)
 *   - revoke deletes the device row + the matching session rows for the user
 *   - revoke on a missing/foreign device throws NOT_FOUND
 *   - requires authentication
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { authKnownDevices, sessions, users } from '@pusula/db';
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

function callerFor(
  userId: string | null,
  opts: { ip?: string | null; userAgent?: string | null } = {},
) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: userId ? session(userId) : null,
      db: probe.db,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    }),
  );
}

describe.runIf(dbAvailable)('auth.devices (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-dev-alice');
  const bobId = newId('u-dev-bob');
  const createdUserIds = [aliceId, bobId];

  async function insertDevice(opts: {
    userId: string;
    userAgentHash: string;
    ipSubnet: string;
    userAgent: string;
    lastSeenAt?: Date;
    firstSeenAt?: Date;
  }) {
    const id = newId('dev');
    await db().insert(authKnownDevices).values({
      id,
      userId: opts.userId,
      userAgentHash: opts.userAgentHash,
      ipSubnet: opts.ipSubnet,
      userAgent: opts.userAgent,
      firstSeenAt: opts.firstSeenAt ?? new Date(),
      lastSeenAt: opts.lastSeenAt ?? new Date(),
    });
    return id;
  }

  async function insertSession(opts: {
    userId: string;
    userAgent: string;
    ipAddress: string;
  }) {
    const id = newId('sess');
    await db()
      .insert(sessions)
      .values({
        id,
        token: `${id}-token`,
        userId: opts.userId,
        userAgent: opts.userAgent,
        ipAddress: opts.ipAddress,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    return id;
  }

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  beforeEach(async () => {
    await db().delete(authKnownDevices).where(dbMod.inArray(authKnownDevices.userId, createdUserIds));
    await db().delete(sessions).where(dbMod.inArray(sessions.userId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(authKnownDevices).where(dbMod.inArray(authKnownDevices.userId, createdUserIds));
    await db().delete(sessions).where(dbMod.inArray(sessions.userId, createdUserIds));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  describe('list', () => {
    it('returns an empty array for a caller with no devices', async () => {
      const result = await callerFor(aliceId).auth.devices.list();
      expect(result).toEqual([]);
    });

    it('returns the caller’s devices in last_seen_at DESC order', async () => {
      await insertDevice({
        userId: aliceId,
        userAgentHash: 'hash-older',
        ipSubnet: '10.0.0.0/24',
        userAgent: 'Old browser',
        lastSeenAt: new Date(Date.now() - 60_000),
      });
      await insertDevice({
        userId: aliceId,
        userAgentHash: 'hash-newer',
        ipSubnet: '10.0.0.0/24',
        userAgent: 'New browser',
        lastSeenAt: new Date(),
      });

      const result = await callerFor(aliceId).auth.devices.list();
      expect(result.map((row) => row.userAgent)).toEqual(['New browser', 'Old browser']);
      expect(result.every((row) => row.isCurrent === false)).toBe(true);
    });

    it("scopes to the caller — Bob never sees Alice's devices", async () => {
      await insertDevice({
        userId: aliceId,
        userAgentHash: 'hash-alice',
        ipSubnet: '10.0.0.0/24',
        userAgent: 'Alice Chrome',
      });
      const bobResult = await callerFor(bobId).auth.devices.list();
      expect(bobResult).toEqual([]);
    });

    it('flags the device matching the request UA + subnet as isCurrent', async () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.6099.130';
      // We must use the *same* normalisation as the helper to produce a matching
      // hash; the router computes its own hash from `ctx.userAgent`. Insert with
      // the hash the router would compute for this UA at request time.
      const { createHash } = await import('node:crypto');
      const normalized = ua
        .replace(/(\d+)\.(\d+)\.[\d.]+/g, '$1.$2')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      const hash = createHash('sha256').update(normalized).digest('hex');

      await insertDevice({
        userId: aliceId,
        userAgentHash: hash,
        ipSubnet: '203.0.113.0/24',
        userAgent: ua,
      });
      await insertDevice({
        userId: aliceId,
        userAgentHash: 'other-hash',
        ipSubnet: '203.0.113.0/24',
        userAgent: 'Other browser',
      });

      const result = await callerFor(aliceId, {
        userAgent: ua,
        ip: '203.0.113.7',
      }).auth.devices.list();

      const currents = result.filter((row) => row.isCurrent);
      expect(currents).toHaveLength(1);
      expect(currents[0]?.userAgent).toBe(ua);
    });

    it('requires authentication', async () => {
      await expect(callerFor(null).auth.devices.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('revoke', () => {
    it('deletes the device row and matching sessions, leaving other sessions alone', async () => {
      const ua = 'chrome/120 win10';
      const otherUa = 'firefox/121 mac';
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256').update(ua).digest('hex');

      const deviceId = await insertDevice({
        userId: aliceId,
        userAgentHash: hash,
        ipSubnet: '203.0.113.0/24',
        userAgent: ua,
      });

      // Two sessions match the device, one doesn't.
      const sessionMatchA = await insertSession({
        userId: aliceId,
        userAgent: ua,
        ipAddress: '203.0.113.7',
      });
      const sessionMatchB = await insertSession({
        userId: aliceId,
        userAgent: ua,
        ipAddress: '203.0.113.55',
      });
      const sessionOther = await insertSession({
        userId: aliceId,
        userAgent: otherUa,
        ipAddress: '198.51.100.7',
      });

      const result = await callerFor(aliceId).auth.devices.revoke({ deviceId });
      expect(result.revokedSessionCount).toBe(2);

      const remainingDevices = await db()
        .select({ id: authKnownDevices.id })
        .from(authKnownDevices)
        .where(dbMod.eq(authKnownDevices.userId, aliceId));
      expect(remainingDevices).toEqual([]);

      const remainingSessions = await db()
        .select({ id: sessions.id })
        .from(sessions)
        .where(dbMod.eq(sessions.userId, aliceId));
      const remainingIds = remainingSessions.map((s) => s.id).sort();
      expect(remainingIds).toEqual([sessionOther].sort());
      expect(remainingIds).not.toContain(sessionMatchA);
      expect(remainingIds).not.toContain(sessionMatchB);
    });

    it("throws NOT_FOUND when the device does not belong to the caller", async () => {
      const deviceId = await insertDevice({
        userId: bobId,
        userAgentHash: 'bob-hash',
        ipSubnet: '10.0.0.0/24',
        userAgent: 'Bob browser',
      });
      await expect(callerFor(aliceId).auth.devices.revoke({ deviceId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND when the device id is missing', async () => {
      await expect(
        callerFor(aliceId).auth.devices.revoke({ deviceId: 'does-not-exist' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('requires authentication', async () => {
      await expect(
        callerFor(null).auth.devices.revoke({ deviceId: 'whatever' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });
});

describe.skipIf(dbAvailable)('auth.devices (skipped — no DATABASE_URL)', () => {
  it('skipped (set DATABASE_URL to enable)', () => {
    expect(true).toBe(true);
  });
});
