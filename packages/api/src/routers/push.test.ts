/**
 * Integration tests for the push-tokens router (Faz 6B / DEM-91). Mirrors the
 * DB-probe pattern from `notifications.test.ts` — skip on a box without
 * infra, otherwise exercise the real Postgres + Drizzle schema + Zod inputs.
 *
 * Coverage:
 *  - register: fresh insert with `ios`/`android`/`web` platform, optional
 *    deviceName, and the row visible via a read-back.
 *  - register idempotency: same token re-registered by the same user
 *    reactivates the row (`revoked_at = null`, `last_used_at` bumped) without
 *    inserting a duplicate.
 *  - register cross-user reassign: token previously belonging to user A
 *    re-registered by user B transfers ownership (`user_id = B`,
 *    `revoked_at = null`).
 *  - register rejects malformed tokens via `expoPushTokenSchema`.
 *  - register rejects unknown platforms.
 *  - revoke flips an active token (`revoked_at` set, `revoked: true`).
 *  - revoke is idempotent: a second call returns `{ revoked: false }`.
 *  - revoke scoped to caller: revoking someone else's token returns
 *    `{ revoked: false }` without touching the row.
 *  - revokeById (Faz 10E): flips a row by id, idempotent, scoped to caller,
 *    rejects empty id (Zod).
 *  - both procedures require auth (UNAUTHORIZED with no session).
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

describe.runIf(dbAvailable)('push-tokens router (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-push-alice');
  const bobId = newId('u-push-bob');
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

  async function readToken(token: string) {
    const [row] = await db()
      .select()
      .from(pushTokens)
      .where(dbMod.eq(pushTokens.token, token))
      .limit(1);
    return row;
  }

  // ----------------------------------------------------------------- register

  it('register: fresh insert stores token + platform + deviceName, last_used_at stamped', async () => {
    const token = newToken();
    const result = await callerFor(aliceId).push.tokens.register({
      token,
      platform: 'ios',
      deviceName: "Abdullah'ın iPhone",
    });
    expect(result.registered).toBe(true);
    expect(result.tokenId).toEqual(expect.any(String));

    const row = await readToken(token);
    expect(row).toMatchObject({
      userId: aliceId,
      token,
      platform: 'ios',
      deviceName: "Abdullah'ın iPhone",
      revokedAt: null,
    });
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('register: deviceName is optional', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({ token, platform: 'android' });
    const row = await readToken(token);
    expect(row?.deviceName).toBeNull();
    expect(row?.platform).toBe('android');
  });

  it('register: re-registering the same token reactivates the existing row (no duplicate)', async () => {
    const token = newToken();
    const first = await callerFor(aliceId).push.tokens.register({
      token,
      platform: 'ios',
    });

    // Simulate a logout that revoked the token.
    await db()
      .update(pushTokens)
      .set({ revokedAt: new Date('2020-01-01') })
      .where(dbMod.eq(pushTokens.token, token));

    const second = await callerFor(aliceId).push.tokens.register({
      token,
      platform: 'ios',
    });
    expect(second.tokenId).toBe(first.tokenId);

    const row = await readToken(token);
    expect(row?.revokedAt).toBeNull();
    expect(row?.userId).toBe(aliceId);

    // No duplicate row for the same token.
    const rows = await db().select().from(pushTokens).where(dbMod.eq(pushTokens.token, token));
    expect(rows).toHaveLength(1);
  });

  it('register: cross-user reassign transfers ownership (Expo recycled the token)', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    expect((await readToken(token))?.userId).toBe(aliceId);

    // Bob now claims the same token (Expo handed it to his new install).
    await callerFor(bobId).push.tokens.register({ token, platform: 'android' });
    const row = await readToken(token);
    expect(row?.userId).toBe(bobId);
    expect(row?.platform).toBe('android');
    expect(row?.revokedAt).toBeNull();

    // Still exactly one row globally.
    const rows = await db().select().from(pushTokens).where(dbMod.eq(pushTokens.token, token));
    expect(rows).toHaveLength(1);
  });

  it('register: rejects malformed tokens (Zod)', async () => {
    await expect(
      callerFor(aliceId).push.tokens.register({
        token: 'not-an-expo-token',
        platform: 'ios',
      }),
    ).rejects.toThrow(/Geçersiz Expo push token|BAD_REQUEST/);
  });

  it('register: rejects unknown platforms (Zod enum)', async () => {
    await expect(
      callerFor(aliceId).push.tokens.register({
        token: newToken(),
        // @ts-expect-error — intentionally bad input.
        platform: 'desktop',
      }),
    ).rejects.toThrow();
  });

  it('register: accepts legacy `ExpoPushToken[xxx]` format too', async () => {
    const token = newToken('ExpoPushToken');
    const result = await callerFor(aliceId).push.tokens.register({
      token,
      platform: 'web',
    });
    expect(result.registered).toBe(true);
    expect((await readToken(token))?.platform).toBe('web');
  });

  it('register: requires authentication', async () => {
    await expect(
      callerFor(null).push.tokens.register({ token: newToken(), platform: 'ios' }),
    ).rejects.toThrow(/UNAUTHORIZED|Oturum gerekli/);
  });

  // ------------------------------------------------------------------- revoke

  it('revoke: flips an active token (revoked_at stamped, revoked: true)', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const result = await callerFor(aliceId).push.tokens.revoke({ token });
    expect(result.revoked).toBe(true);
    const row = await readToken(token);
    expect(row?.revokedAt).not.toBeNull();
  });

  it('revoke: idempotent — a second call returns revoked: false', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const first = await callerFor(aliceId).push.tokens.revoke({ token });
    expect(first.revoked).toBe(true);
    const stampAfterFirst = (await readToken(token))?.revokedAt;

    const second = await callerFor(aliceId).push.tokens.revoke({ token });
    expect(second.revoked).toBe(false);

    // The original `revoked_at` is preserved — a re-revoke doesn't bump it.
    const stampAfterSecond = (await readToken(token))?.revokedAt;
    expect(stampAfterSecond).toEqual(stampAfterFirst);
  });

  it('revoke: scoped to the caller — revoking another user’s token is a no-op', async () => {
    const token = newToken();
    await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const result = await callerFor(bobId).push.tokens.revoke({ token });
    expect(result.revoked).toBe(false);
    const row = await readToken(token);
    expect(row?.revokedAt).toBeNull();
    expect(row?.userId).toBe(aliceId);
  });

  it('revoke: unknown token returns revoked: false silently', async () => {
    const result = await callerFor(aliceId).push.tokens.revoke({
      token: newToken(),
    });
    expect(result.revoked).toBe(false);
  });

  it('revoke: requires authentication', async () => {
    await expect(callerFor(null).push.tokens.revoke({ token: newToken() })).rejects.toThrow(
      /UNAUTHORIZED|Oturum gerekli/,
    );
  });

  // -------------------------------------------------------------- revokeById

  it('revokeById: flips an active token by row id (revoked: true)', async () => {
    const token = newToken();
    const reg = await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const result = await callerFor(aliceId).push.tokens.revokeById({ id: reg.tokenId });
    expect(result.revoked).toBe(true);
    const row = await readToken(token);
    expect(row?.revokedAt).not.toBeNull();
  });

  it('revokeById: idempotent — a second call returns revoked: false', async () => {
    const token = newToken();
    const reg = await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const first = await callerFor(aliceId).push.tokens.revokeById({ id: reg.tokenId });
    expect(first.revoked).toBe(true);
    const stampAfterFirst = (await readToken(token))?.revokedAt;

    const second = await callerFor(aliceId).push.tokens.revokeById({ id: reg.tokenId });
    expect(second.revoked).toBe(false);

    const stampAfterSecond = (await readToken(token))?.revokedAt;
    expect(stampAfterSecond).toEqual(stampAfterFirst);
  });

  it("revokeById: scoped to the caller — revoking another user’s row is a no-op", async () => {
    const token = newToken();
    const reg = await callerFor(aliceId).push.tokens.register({ token, platform: 'ios' });
    const result = await callerFor(bobId).push.tokens.revokeById({ id: reg.tokenId });
    expect(result.revoked).toBe(false);
    const row = await readToken(token);
    expect(row?.revokedAt).toBeNull();
    expect(row?.userId).toBe(aliceId);
  });

  it('revokeById: unknown id returns revoked: false silently', async () => {
    const result = await callerFor(aliceId).push.tokens.revokeById({
      id: 'pt_does_not_exist',
    });
    expect(result.revoked).toBe(false);
  });

  it('revokeById: rejects empty id (Zod)', async () => {
    await expect(callerFor(aliceId).push.tokens.revokeById({ id: '' })).rejects.toThrow(
      /BAD_REQUEST|Token kimliği/,
    );
  });

  it('revokeById: requires authentication', async () => {
    await expect(
      callerFor(null).push.tokens.revokeById({ id: 'whatever' }),
    ).rejects.toThrow(/UNAUTHORIZED|Oturum gerekli/);
  });
});
