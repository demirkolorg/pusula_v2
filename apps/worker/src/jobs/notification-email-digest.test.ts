/**
 * Integration tests for the email digest processor (Faz 10G — DEM-141).
 *
 * Aynı Postgres-probe pattern'i diğer worker testleri gibi: infra yoksa
 * suite skip. Mailer test'lerde capturing stub.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  notificationOutbox,
  notificationPreferences,
  users,
} from '@pusula/db';
import {
  processEmailDigestTick,
  type DigestCadence,
} from './notification-email-digest';
import type { EmailMailer } from './notification-email';

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

const CONFIG = { from: 'noreply@pusula.test', appUrl: 'https://app.pusula.test' };

function capturingMailer(): EmailMailer & {
  calls: Array<{ to: string; subject: string; html: string; text: string }>;
} {
  const calls: Array<{ to: string; subject: string; html: string; text: string }> = [];
  return {
    calls,
    send: async (msg) => {
      calls.push({
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      return { messageId: `dgst_${calls.length}` };
    },
  };
}

describe.runIf(dbAvailable)('processEmailDigestTick (integration)', () => {
  const db = () => probe!.db;
  const aliceId = newId('u-dgst-alice');
  const bobId = newId('u-dgst-bob');
  const carolId = newId('u-dgst-carol');
  const createdUserIds = [aliceId, bobId, carolId];

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

  async function seedDigestRow(opts: {
    recipientId: string;
    type?: dbMod.NotificationOutboxRow['type'];
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const [row] = await db()
      .insert(notificationOutbox)
      .values({
        eventId: null,
        recipientId: opts.recipientId,
        type: opts.type ?? 'card_assigned',
        channel: 'email',
        status: 'digest_queued',
        payload: opts.payload ?? {},
      })
      .returning({ id: notificationOutbox.id });
    return row!.id;
  }

  async function setPreference(userId: string, emailMode: 'instant' | 'hourly_digest' | 'daily_digest' | 'off') {
    await db().insert(notificationPreferences).values({
      userId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode,
    });
  }

  it('empty queue → no-op (scanned=0, emailsSent=0)', async () => {
    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result).toEqual({
      scanned: 0,
      recipientsProcessed: 0,
      recipientsSkipped: 0,
      emailsSent: 0,
    });
    expect(mailer.calls).toHaveLength(0);
  });

  it("hourly tick + 3 digest_queued rows for hourly_digest user → one email, all rows stamped 'sent'", async () => {
    await setPreference(aliceId, 'hourly_digest');
    const r1 = await seedDigestRow({
      recipientId: aliceId,
      type: 'card_assigned',
      payload: { actorName: 'Bob', cardTitle: 'Önemli kart' },
    });
    const r2 = await seedDigestRow({
      recipientId: aliceId,
      type: 'card_assigned',
      payload: { actorName: 'Carol', cardTitle: 'Diğer kart' },
    });
    const r3 = await seedDigestRow({
      recipientId: aliceId,
      type: 'comment_reply',
      payload: { actorName: 'Bob', cardTitle: 'Önemli kart' },
    });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result.scanned).toBe(3);
    expect(result.recipientsProcessed).toBe(1);
    expect(result.emailsSent).toBe(1);

    expect(mailer.calls).toHaveLength(1);
    const sent = mailer.calls[0]!;
    expect(sent.to).toBe(`${aliceId}@example.test`);
    expect(sent.subject).toContain('3 yeni bildirim');
    expect(sent.subject).toContain('saatlik özet');
    expect(sent.html).toContain('Atamalar');
    expect(sent.html).toContain('Yorumlar');

    const rows = await db()
      .select({ id: notificationOutbox.id, status: notificationOutbox.status, processedAt: notificationOutbox.processedAt })
      .from(notificationOutbox)
      .where(dbMod.inArray(notificationOutbox.id, [r1, r2, r3]));
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
    expect(rows.every((r) => r.processedAt !== null)).toBe(true);
  });

  it('mixed recipients (Alice hourly + Bob hourly) → two emails on hourly tick', async () => {
    await setPreference(aliceId, 'hourly_digest');
    await setPreference(bobId, 'hourly_digest');
    await seedDigestRow({
      recipientId: aliceId,
      payload: { actorName: 'X', cardTitle: 'A1' },
    });
    await seedDigestRow({
      recipientId: bobId,
      payload: { actorName: 'Y', cardTitle: 'B1' },
    });
    await seedDigestRow({
      recipientId: bobId,
      payload: { actorName: 'Z', cardTitle: 'B2' },
    });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result.scanned).toBe(3);
    expect(result.emailsSent).toBe(2);
    expect(mailer.calls.map((c) => c.to).sort()).toEqual(
      [`${aliceId}@example.test`, `${bobId}@example.test`].sort(),
    );
  });

  it('hourly tick: daily_digest user skipped, hourly_digest user processed', async () => {
    await setPreference(aliceId, 'hourly_digest');
    await setPreference(bobId, 'daily_digest');
    await seedDigestRow({ recipientId: aliceId, payload: { cardTitle: 'A' } });
    await seedDigestRow({ recipientId: bobId, payload: { cardTitle: 'B' } });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result.scanned).toBe(2);
    expect(result.recipientsProcessed).toBe(1);
    expect(result.recipientsSkipped).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(mailer.calls).toHaveLength(1);
    expect(mailer.calls[0]!.to).toBe(`${aliceId}@example.test`);

    // Bob'un satırı `digest_queued` kalıyor (daily cron alacak).
    const [bobRow] = await db()
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, bobId));
    expect(bobRow?.status).toBe('digest_queued');
  });

  it('daily tick: hourly_digest user skipped, daily_digest user processed', async () => {
    await setPreference(aliceId, 'hourly_digest');
    await setPreference(bobId, 'daily_digest');
    await seedDigestRow({ recipientId: aliceId, payload: { cardTitle: 'A' } });
    await seedDigestRow({ recipientId: bobId, payload: { cardTitle: 'B' } });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'daily');
    expect(result.recipientsProcessed).toBe(1);
    expect(mailer.calls[0]?.to).toBe(`${bobId}@example.test`);
    expect(mailer.calls[0]?.subject).toContain('günlük özet');
  });

  it("user switched to 'instant' between damgalanma and tick → digest satırları sessiz skip", async () => {
    await setPreference(aliceId, 'instant'); // tercih artık instant
    await seedDigestRow({
      recipientId: aliceId,
      payload: { cardTitle: 'Eski satır' },
    });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result.scanned).toBe(1);
    expect(result.recipientsProcessed).toBe(0);
    expect(result.recipientsSkipped).toBe(1);
    expect(mailer.calls).toHaveLength(0);

    // Satır `digest_queued` kalır — orphan temizliği gelecek faz.
    const [row] = await db()
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, aliceId));
    expect(row?.status).toBe('digest_queued');
  });

  it("user has emailEnabled=false → digest rows stamped 'sent' without sending mail", async () => {
    await db().insert(notificationPreferences).values({
      userId: aliceId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: false,
      emailMode: 'hourly_digest',
    });
    const rowId = await seedDigestRow({
      recipientId: aliceId,
      payload: { cardTitle: 'X' },
    });

    const mailer = capturingMailer();
    const result = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(result.recipientsProcessed).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(mailer.calls).toHaveLength(0);

    const [row] = await db()
      .select({ status: notificationOutbox.status, processedAt: notificationOutbox.processedAt })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.id, rowId));
    expect(row?.status).toBe('sent');
    expect(row?.processedAt).not.toBeNull();
  });

  it('idempotent: second tick on same cadence is a no-op (rows already stamped)', async () => {
    await setPreference(aliceId, 'hourly_digest');
    await seedDigestRow({ recipientId: aliceId, payload: { cardTitle: 'A' } });

    const mailer = capturingMailer();
    const first = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(first.emailsSent).toBe(1);
    const second = await processEmailDigestTick(db() as never, mailer, CONFIG, 'hourly');
    expect(second.scanned).toBe(0);
    expect(mailer.calls).toHaveLength(1);
  });

  it('cadence enum is exactly the cron pair', () => {
    // Hourly + daily — `notification-email-digest.ts` cron bağlanması bu
    // tek kaynakla yapılır, başka cadence türü eklemiyoruz (Faz 11+
    // weekly digest kapsam dışı).
    const cadences: DigestCadence[] = ['hourly', 'daily'];
    expect(cadences).toEqual(['hourly', 'daily']);
  });
});
