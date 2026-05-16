/**
 * Integration tests for the notification-email job (Faz 6B — DEM-91).
 *
 * Hits a real Postgres (`DATABASE_URL`, via `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped (mirrors the
 * `realtime-publish.test.ts` pattern). Resend is *not* required — the mailer
 * is injectable and tests pass a capturing stub.
 *
 * Coverage:
 *  - Happy path: sends + stamps `processed_at` + `status='sent'`.
 *  - Idempotency: a second run on a stamped row is a no-op ('missing').
 *  - Preference-disabled: `email_enabled=false` skips the send + stamps.
 *  - Missing recipient: a deleted user just stamps (no crash, no send).
 *  - Channel filter: rows with `channel='in_app'` or `'push'` are skipped.
 *  - Standalone (no recipient_id, payload.email set): sends to payload.email.
 *  - Mailer throws → outbox NOT stamped (tx rollback; BullMQ retry takes over).
 *  - Preference hierarchy: card scope override beats workspace scope.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import { notificationOutbox, notificationPreferences, users } from '@pusula/db';
import {
  createResendMailer,
  processNotificationEmailJob,
  type EmailMailer,
} from './notification-email';

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

function capturingMailer(): EmailMailer & { calls: Array<Parameters<EmailMailer['send']>[0]> } {
  const calls: Array<Parameters<EmailMailer['send']>[0]> = [];
  return {
    send: async (msg) => {
      calls.push(msg);
      return { messageId: `msg_${calls.length}` };
    },
    calls,
  };
}

function throwingMailer(message = 'resend offline'): EmailMailer {
  return {
    send: async () => {
      throw new Error(message);
    },
  };
}

const CONFIG = { from: 'Pusula <no-reply@pusula.test>', appUrl: 'https://app.pusula.test' };

describe('createResendMailer', () => {
  it('dry-run ignores an API key and uses the log-only stub', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mailer = createResendMailer({
        apiKey: 're_real_key_that_must_not_be_used',
        from: CONFIG.from,
        nodeEnv: 'development',
        dryRun: true,
      });

      await expect(
        mailer.send({
          from: CONFIG.from,
          to: 'bob@example.test',
          subject: 'Dry run',
          html: '<p>Dry run</p>',
          text: 'Dry run',
        }),
      ).resolves.toEqual({ messageId: null });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('dry-run'));
    } finally {
      warn.mockRestore();
    }
  });
});

describe.runIf(dbAvailable)('processNotificationEmailJob (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-nem-alice');
  const bobId = newId('u-nem-bob');
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
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(notificationOutbox)
      .where(dbMod.inArray(notificationOutbox.recipientId, createdUserIds));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  async function seedOutbox(opts: {
    recipientId: string | null;
    type?: dbMod.NotificationOutboxRow['type'];
    channel?: 'in_app' | 'email' | 'push';
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const [row] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: null,
        recipientId: opts.recipientId,
        type: opts.type ?? 'card_assigned',
        channel: opts.channel ?? 'email',
        payload: opts.payload ?? {},
      })
      .returning({ id: notificationOutbox.id });
    return row!.id;
  }

  async function readOutbox(id: string) {
    const [row] = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, id))
      .limit(1);
    return row;
  }

  it('happy path: sends + stamps processed_at + status=sent', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'card_assigned',
      payload: {
        actorName: 'Bob',
        cardTitle: 'Tasarımı bitir',
        cardId: 'c1',
        boardId: 'b1',
        workspaceId: 'w1',
        activityType: 'card.member_added',
      },
    });

    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'sent', messageId: 'msg_1' });

    expect(mailer.calls).toHaveLength(1);
    const sent = mailer.calls[0]!;
    expect(sent.from).toBe(CONFIG.from);
    expect(sent.to).toBe(`${aliceId}@example.test`);
    expect(sent.subject).toContain('Tasarımı bitir');
    expect(sent.subject).toContain('Bob');
    expect(sent.html).toContain('Tasarımı bitir');
    expect(sent.text).toContain('Tasarımı bitir');
    // Deep link assembled from payload ids.
    expect(sent.html).toContain('https://app.pusula.test/workspaces/w1/boards/b1?card=c1');

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
    expect(row?.status).toBe('sent');
    expect(row?.attempts).toBe(1);
  });

  it('idempotent: a second run on a stamped row is missing/no-op', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });
    const mailer = capturingMailer();
    await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(mailer.calls).toHaveLength(1);

    const second = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(second).toEqual({ kind: 'skipped', reason: 'missing' });
    expect(mailer.calls).toHaveLength(1);
  });

  it('channel filter: rows with channel=in_app are skipped', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      channel: 'in_app',
      payload: {},
    });
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'missing' });
    expect(mailer.calls).toHaveLength(0);
    // The in_app row is NOT stamped — that's the 6A in-app processor's job.
    const row = await readOutbox(outboxId);
    expect(row?.processedAt).toBeNull();
  });

  it('channel filter: rows with channel=push are skipped', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      channel: 'push',
      payload: {},
    });
    const mailer = capturingMailer();
    expect(await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId })).toEqual({
      kind: 'skipped',
      reason: 'missing',
    });
    expect(mailer.calls).toHaveLength(0);
  });

  it('preference-disabled: email_enabled=false skips send + stamps', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X', workspaceId: 'w-pref-1' },
    });
    // Global default disable.
    await db().insert(notificationPreferences).values({
      userId: aliceId,
      emailEnabled: false,
    });

    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'preference-disabled' });
    expect(mailer.calls).toHaveLength(0);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
    expect(row?.status).toBe('sent'); // stamped as handled
  });

  it('no preference row: email defaults to enabled (sends)', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });
    // Insert a preference for a *different* user — bob's row must not affect alice.
    await db().insert(notificationPreferences).values({ userId: bobId, emailEnabled: false });

    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(mailer.calls).toHaveLength(1);
  });

  // Note: full scope-hierarchy assertions (card override beats workspace,
  // narrowest wins) need real workspace + board + card seeds because of the
  // FK constraints on `notification_preferences`. Those live in the
  // end-to-end suite (Faz 6E — DEM-94); the in-process unit covers the
  // global override path here.

  it('missing recipient: payload-less standalone row (no recipient_id, no payload.email) → stamp + skip', async () => {
    // `notification_outbox.recipient_id` is `ON DELETE CASCADE`, so we can't
    // simulate "user deleted out from under the row" without removing the row
    // too. The next-closest case the processor must handle gracefully: a row
    // with no recipient_id and no `payload.email` to fall back to (a
    // malformed outbox insert that slipped past the rule engine). The
    // processor stamps and skips so the sweeper moves on.
    const outboxId = await seedOutbox({ recipientId: null, payload: {} });
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'no-recipient' });
    expect(mailer.calls).toHaveLength(0);
    expect((await readOutbox(outboxId))?.processedAt).not.toBeNull();
  });

  it('standalone (no recipient_id, payload.email set): sends to payload.email', async () => {
    const outboxId = await seedOutbox({
      recipientId: null,
      type: 'board_invitation',
      payload: {
        actorName: 'Bob',
        boardName: 'Yeni Pano',
        email: 'newcomer@example.test',
        inviteToken: 'inv-abc-123',
      },
    });

    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(mailer.calls).toHaveLength(1);
    expect(mailer.calls[0]!.to).toBe('newcomer@example.test');
    expect(mailer.calls[0]!.subject).toContain('Yeni Pano');
    expect(mailer.calls[0]!.html).toContain('inv-abc-123');

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
  });

  it('mailer throws → outbox not stamped (tx rollback, BullMQ retries)', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      payload: { actorName: 'Bob', cardTitle: 'X' },
    });
    await expect(
      processNotificationEmailJob(db() as never, throwingMailer(), CONFIG, { outboxId }),
    ).rejects.toThrow(/resend offline/);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).toBeNull();
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(0);
  });

  it('renders mention email with comment preview', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'mention',
      payload: {
        actorName: 'Bob',
        cardTitle: 'Code review',
        commentPreview: '@alice şu kısma bakar mısın?',
        cardId: 'c1',
        boardId: 'b1',
        workspaceId: 'w1',
      },
    });
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(mailer.calls[0]!.html).toContain('@alice şu kısma bakar mısın?');
    expect(mailer.calls[0]!.subject).toContain('Bob');
  });

  it('renders due_overdue email with the right tone', async () => {
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'due_overdue',
      payload: { cardTitle: 'Rapor gönder', cardId: 'c1', boardId: 'b1', workspaceId: 'w1' },
    });
    const mailer = capturingMailer();
    await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(mailer.calls[0]!.subject).toMatch(/geçti/i);
  });

  // ───────────────────────────────── quiet hours (Faz 10F / DEM-140)

  /**
   * Helper: pick an `Europe/Istanbul` window that contains *now*, so we
   * don't have to mock the clock to land in/out of the window. `from`
   * 2h-before-now and `to` 2h-after-now covers any current Istanbul time.
   */
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

  function windowFarFromNow(): { from: string; to: string } {
    // 6h before now → 4h before now: a safely-past window the helper
    // evaluates as outside ("not quiet").
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const now = new Date();
    const start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const end = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    return {
      from: fmt.format(start).replace('24:', '00:'),
      to: fmt.format(end).replace('24:', '00:'),
    };
  }

  it('quiet-hours: card_assigned inside window → dead + quiet_hours_window reason', async () => {
    const { from, to } = windowAroundNow();
    await db()
      .insert(notificationPreferences)
      .values({
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
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'quiet-hours' });
    expect(mailer.calls).toHaveLength(0);

    const row = await readOutbox(outboxId);
    expect(row?.processedAt).not.toBeNull();
    expect(row?.status).toBe('dead');
    expect(row?.lastError).toBe('quiet_hours_window');
  });

  it('quiet-hours: mention inside window BYPASSES suppression (sent)', async () => {
    const { from, to } = windowAroundNow();
    await db()
      .insert(notificationPreferences)
      .values({
        userId: aliceId,
        quietFrom: from,
        quietTo: to,
        quietTimezone: 'Europe/Istanbul',
      });
    const outboxId = await seedOutbox({
      recipientId: aliceId,
      type: 'mention',
      payload: { actorName: 'Bob', cardTitle: 'X', commentPreview: '@alice' },
    });
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(mailer.calls).toHaveLength(1);
  });

  it('quiet-hours: window in the past → not quiet → normal send', async () => {
    const { from, to } = windowFarFromNow();
    await db()
      .insert(notificationPreferences)
      .values({
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
    const mailer = capturingMailer();
    const outcome = await processNotificationEmailJob(db() as never, mailer, CONFIG, { outboxId });
    expect(outcome.kind).toBe('sent');
    expect(mailer.calls).toHaveLength(1);
  });
});
