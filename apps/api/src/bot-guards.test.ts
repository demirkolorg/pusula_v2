/**
 * Task 9 (Public API + Bot) — auth-layer bot guards.
 *
 * Bot users are API-key-bound machine accounts (`users.is_bot`): passwordless,
 * so login is already impossible, but `apps/api/src/auth.ts` adds two
 * defense-in-depth layers on top of that — a `session.create.before` hook that
 * refuses to open a session for a bot, and a password-reset path that silently
 * no-ops for bots. These tests exercise the small, exported helpers those hooks
 * delegate to (`isBotUser`, `assertSessionUserNotBot`, `maybeSendResetPassword`)
 * against a real Postgres. Like the other integration suites, the DB is probed
 * at collection time and the suite is skipped on a box without infra.
 *
 * `./auth-emails` is mocked so the human reset-password path is observed via a
 * spy and nothing leaves the process. See `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import * as dbMod from '@pusula/db';
import { users } from '@pusula/db';

// Mock the transactional mailer: assert the human path calls it and the bot path
// does not. Provide every export `auth.ts` imports so the module resolves.
const sendResetPasswordEmailMock = vi.fn(async () => {});
vi.mock('./auth-emails', () => ({
  sendResetPasswordEmail: sendResetPasswordEmailMock,
  sendVerificationEmail: vi.fn(async () => {}),
  sendNewDeviceLoginEmail: vi.fn(async () => {}),
}));

// Import after the mock is registered. `auth.ts` instantiates Better Auth at
// module load (needs env — provided by the monorepo `.env` in dev/test).
const { isBotUser, assertSessionUserNotBot, maybeSendResetPassword } = await import('./auth');

// Probe the database at collection time so `describe.runIf` can react to it.
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

describe.runIf(dbAvailable)('bot guards (auth, integration)', () => {
  const db = () => probe!.db;
  const botId = newId('u-botguard-bot');
  const humanId = newId('u-botguard-human');
  const botEmail = `${botId}@bots.pusula.internal`;
  const humanEmail = `${humanId}@example.test`;
  const RESET_URL = 'https://app.test/reset-password?token=tok_abc';

  beforeAll(async () => {
    await db()
      .insert(users)
      .values([
        { id: botId, name: 'Bot', email: botEmail, isBot: true },
        { id: humanId, name: 'Human', email: humanEmail, isBot: false },
      ]);
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(users).where(dbMod.inArray(users.id, [botId, humanId]));
    await probe.pool.end();
  });

  it('isBotUser: true for a bot, false for a human, false for a missing row', async () => {
    expect(await isBotUser(botId)).toBe(true);
    expect(await isBotUser(humanId)).toBe(false);
    expect(await isBotUser('does-not-exist')).toBe(false);
  });

  it('assertSessionUserNotBot: rejects a bot with an APIError, allows a human', async () => {
    await expect(assertSessionUserNotBot(botId)).rejects.toBeInstanceOf(APIError);
    await expect(assertSessionUserNotBot(humanId)).resolves.toBeUndefined();
  });

  it('maybeSendResetPassword: silently no-ops for a bot, mails a human', async () => {
    sendResetPasswordEmailMock.mockClear();

    await maybeSendResetPassword({ id: botId, email: botEmail }, RESET_URL);
    expect(sendResetPasswordEmailMock).not.toHaveBeenCalled();

    await maybeSendResetPassword({ id: humanId, email: humanEmail }, RESET_URL);
    expect(sendResetPasswordEmailMock).toHaveBeenCalledTimes(1);
    expect(sendResetPasswordEmailMock).toHaveBeenCalledWith({ to: humanEmail, url: RESET_URL });
  });
});
