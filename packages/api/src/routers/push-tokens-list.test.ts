/**
 * Integration tests for `push.tokens.list` (Faz 10B / DEM-136). The Faz 6B
 * `register` / `revoke` procedures have their own test file
 * (`push.test.ts`); this suite only covers the `list` surface the bildirim
 * ayar ekranı drives.
 *
 * Coverage:
 *  - empty caller returns empty list
 *  - returns metadata for active tokens (id, platform, deviceName,
 *    lastUsedAt, createdAt) — the raw token string is NEVER returned
 *  - revoked tokens are hidden
 *  - cross-user isolation (Bob can't see Alice's tokens)
 *  - sort order: most-recently-used first, COALESCE(last_used_at,
 *    created_at) so freshly registered tokens (no `last_used_at`) stay near
 *    the top
 *  - requires authentication
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { pushTokens, users } from '@pusula/db';
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
const newToken = (prefix = 'ExponentPushToken') =>
  `${prefix}[${Math.random().toString(36).slice(2, 22)}]`;

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string | null) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: userId ? session(userId) : null,
      db: probe.db,
    }),
  );
}

describe.runIf(dbAvailable)('push.tokens.list (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-ptlist-alice');
  const bobId = newId('u-ptlist-bob');
  const createdUserIds = [aliceId, bobId];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  beforeEach(async () => {
    await db().delete(pushTokens).where(dbMod.inArray(pushTokens.userId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(pushTokens).where(dbMod.inArray(pushTokens.userId, createdUserIds));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  it('returns an empty array for a caller with no tokens', async () => {
    const result = await callerFor(aliceId).push.tokens.list();
    expect(result).toEqual([]);
  });

  it('returns metadata for active tokens — without the raw token string', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({
      token,
      platform: 'ios',
      deviceName: "Abdullah'ın iPhone",
    });
    const result = await callerFor(aliceId).push.tokens.list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: 'ios',
      deviceName: "Abdullah'ın iPhone",
    });
    expect(result[0]?.id).toEqual(expect.any(String));
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    // The token string is intentionally not surfaced.
    expect(result[0]).not.toHaveProperty('token');
  });

  it('hides revoked tokens', async () => {
    const live = newToken();
    const dead = newToken();
    await callerFor(aliceId).push.tokens.register({ token: live, platform: 'ios' });
    await callerFor(aliceId).push.tokens.register({ token: dead, platform: 'android' });
    await callerFor(aliceId).push.tokens.revoke({ token: dead });

    const result = await callerFor(aliceId).push.tokens.list();
    expect(result).toHaveLength(1);
    expect(result[0]?.platform).toBe('ios');
  });

  it("scopes to the caller — Bob never sees Alice's tokens", async () => {
    await callerFor(aliceId).push.tokens.register({ token: newToken(), platform: 'ios' });
    const bobResult = await callerFor(bobId).push.tokens.list();
    expect(bobResult).toEqual([]);
  });

  it('orders by COALESCE(last_used_at, created_at) DESC — newest device first', async () => {
    // Insert three rows directly to control timestamps deterministically.
    const oldest = `${aliceId}-old`;
    const middle = `${aliceId}-mid`;
    const newest = `${aliceId}-new`;
    await db()
      .insert(pushTokens)
      .values([
        {
          id: oldest,
          userId: aliceId,
          token: newToken(),
          platform: 'ios',
          createdAt: new Date(Date.now() - 60_000),
          lastUsedAt: new Date(Date.now() - 60_000),
        },
        {
          id: middle,
          userId: aliceId,
          token: newToken(),
          platform: 'android',
          createdAt: new Date(Date.now() - 30_000),
          lastUsedAt: new Date(Date.now() - 30_000),
        },
        {
          id: newest,
          userId: aliceId,
          token: newToken(),
          platform: 'web',
          createdAt: new Date(Date.now() - 5_000),
          lastUsedAt: new Date(Date.now() - 5_000),
        },
      ]);

    const result = await callerFor(aliceId).push.tokens.list();
    expect(result.map((r) => r.id)).toEqual([newest, middle, oldest]);
  });

  it('keeps just-registered tokens (last_used_at = null) near the top via COALESCE fallback', async () => {
    const oldUsed = `${aliceId}-oldused`;
    const fresh = `${aliceId}-fresh`;
    await db()
      .insert(pushTokens)
      .values([
        {
          id: oldUsed,
          userId: aliceId,
          token: newToken(),
          platform: 'ios',
          createdAt: new Date(Date.now() - 60_000),
          lastUsedAt: new Date(Date.now() - 60_000),
        },
        {
          id: fresh,
          userId: aliceId,
          token: newToken(),
          platform: 'android',
          createdAt: new Date(Date.now() - 5_000),
          lastUsedAt: null,
        },
      ]);
    const result = await callerFor(aliceId).push.tokens.list();
    // `fresh` has no `last_used_at` but a newer `created_at`; COALESCE makes
    // it lead the order even though the older row has `last_used_at` set.
    expect(result.map((r) => r.id)).toEqual([fresh, oldUsed]);
  });

  it('requires authentication', async () => {
    await expect(callerFor(null).push.tokens.list()).rejects.toThrow(
      /UNAUTHORIZED|Oturum gerekli/,
    );
  });
});
