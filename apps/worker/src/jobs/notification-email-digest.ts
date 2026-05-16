/**
 * Email digest processor — Faz 10G (DEM-141).
 *
 * Cron tabanlı: BullMQ `pusula-notifications-email-digest` kuyruğuna iki
 * repeatable job kayıt edilir:
 *  - `notification-email-digest-hourly` — `0 * * * *` (her saat başı UTC).
 *  - `notification-email-digest-daily`  — `0 8 * * *` (her gün 08:00 UTC).
 *
 * Her tick'te `notification_outbox.status = 'digest_queued'` damgalı satırlar
 * recipient bazlı toplanır; tercih (`email_mode`) güncel okunur ve hourly
 * tick yalnız `'hourly_digest'` mod'undaki kullanıcıları, daily tick yalnız
 * `'daily_digest'` mod'undakileri işler. Recipient'in tercihi arada
 * değiştiyse (örn. digest_queued → instant) satırlar bu cron tarafından
 * dokunulmaz — sweeper bunları sessiz tarar (publish processor da
 * `digest_queued` damgayı görüp skip eder); 10H+ sertleştirme döneminde
 * "orphan digest_queued" temizleyici eklenecek.
 *
 * Race / idempotency:
 *  - Satırlar `FOR UPDATE SKIP LOCKED` ile kilitlenir; bir başka digest
 *    cron tick'i aynı satırı çekemez.
 *  - Recipient gruplaması SELECT içinde `ORDER BY recipient_id, created_at`
 *    ile yapılır; loop tek transaction'da grupları işler.
 *  - Resend `emails.send` başarılı olursa o recipient'a ait tüm satırlar
 *    `status='sent' + processed_at=NOW()` damgalanır.
 *  - Mailer fail ederse tx rollback olur, satırlar `digest_queued` kalır;
 *    BullMQ retry/backoff ile cron job tekrar denenir. Bir sonraki cron
 *    tick'i sırada bekler (BullMQ debounce: `jobId = digest-{cadence}`).
 *
 * Mute-bypass tipler (mention + davetler) `digest_queued` damgalanmaz —
 * `notification-outbox.ts:insertNotificationOutbox` zaten anlık `pending`
 * yazar, normal 6A → 6B email kanal kuyruğu üzerinden gider.
 *
 * Detay → `docs/architecture/06-bildirim-altyapisi.md` "Email digest (Faz
 * 10G)" + `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 6.
 */
import { and, asc, eq, inArray, isNull, sql } from '@pusula/db';
import { notificationOutbox, notificationPreferences, users } from '@pusula/db';
import type { Database } from '@pusula/db';
import type { EmailDigestMode, NotificationType } from '@pusula/domain';
import { renderDigestEmail, type DigestItem } from './notification-templates';
import type { EmailMailer } from './notification-email';

/** Cron cadence — hourly / daily switch. */
export type DigestCadence = 'hourly' | 'daily';

/** BullMQ job names — `index.ts` registers two repeatable jobs by these. */
export const NOTIFICATION_EMAIL_DIGEST_HOURLY_JOB_NAME = 'notification-email-digest-hourly';
export const NOTIFICATION_EMAIL_DIGEST_DAILY_JOB_NAME = 'notification-email-digest-daily';

/** Cron expressions (UTC). */
export const NOTIFICATION_EMAIL_DIGEST_HOURLY_CRON = '0 * * * *';
/** Daily tick fires at 08:00 UTC. Per-user timezone awareness is future scope. */
export const NOTIFICATION_EMAIL_DIGEST_DAILY_CRON = '0 8 * * *';

/** Outcome surface — useful for tests + structured logs. */
export interface DigestRunResult {
  scanned: number;
  recipientsProcessed: number;
  recipientsSkipped: number;
  emailsSent: number;
}

/** What we pull out of `notification_outbox` for the digest. */
interface DigestRow {
  id: string;
  recipientId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Per-tick processor. Inputs:
 *  - `db`     — transactional DB (own tx is opened inside).
 *  - `mailer` — same `EmailMailer` interface the 6B transactional processor
 *    uses; dependency-injected for tests.
 *  - `config` — `from` + `appUrl` for `renderDigestEmail` link assembly.
 *  - `cadence` — which mode's recipients to flush.
 */
export async function processEmailDigestTick(
  db: Database,
  mailer: EmailMailer,
  config: { from: string; appUrl: string },
  cadence: DigestCadence,
): Promise<DigestRunResult> {
  return db.transaction(async (tx) => {
    // Lock the digest_queued rows for all candidate recipients. The
    // partial index `notification_outbox_digest_queued_idx`
    // (migration 0026) keeps this an index-only walk.
    //
    // `recipient_id` is nullable on the outbox column, but only email
    // channel rows reach `digest_queued` (the outbox helper sets the
    // status only on email rules) and the email rule engine requires a
    // user-id, so `recipient_id` is always non-null here. Still, we
    // filter explicitly to keep the type narrowing exact.
    const rows = (await tx
      .select({
        id: notificationOutbox.id,
        recipientId: notificationOutbox.recipientId,
        type: notificationOutbox.type,
        payload: notificationOutbox.payload,
        createdAt: notificationOutbox.createdAt,
      })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.channel, 'email'),
          eq(notificationOutbox.status, 'digest_queued'),
          isNull(notificationOutbox.processedAt),
          sql`${notificationOutbox.recipientId} IS NOT NULL`,
        ),
      )
      .orderBy(asc(notificationOutbox.recipientId), asc(notificationOutbox.createdAt))
      .for('update', { skipLocked: true })) as DigestRow[];

    if (rows.length === 0) {
      return {
        scanned: 0,
        recipientsProcessed: 0,
        recipientsSkipped: 0,
        emailsSent: 0,
      };
    }

    // Group rows by recipient. `Map` insertion order = creation order of
    // the first row → grupları işleyiş sırası deterministik.
    const byRecipient = new Map<string, DigestRow[]>();
    for (const row of rows) {
      const bucket = byRecipient.get(row.recipientId);
      if (bucket) bucket.push(row);
      else byRecipient.set(row.recipientId, [row]);
    }

    let recipientsProcessed = 0;
    let recipientsSkipped = 0;
    let emailsSent = 0;

    for (const [recipientId, bucket] of byRecipient) {
      const handled = await handleRecipientBucket({
        tx,
        mailer,
        config,
        cadence,
        recipientId,
        bucket,
      });
      if (handled === 'sent') {
        recipientsProcessed++;
        emailsSent++;
      } else if (handled === 'processed-no-mail') {
        recipientsProcessed++;
      } else {
        recipientsSkipped++;
      }
    }

    return {
      scanned: rows.length,
      recipientsProcessed,
      recipientsSkipped,
      emailsSent,
    };
  });
}

type HandleBucketArgs = {
  tx: Database;
  mailer: EmailMailer;
  config: { from: string; appUrl: string };
  cadence: DigestCadence;
  recipientId: string;
  bucket: DigestRow[];
};

type BucketOutcome = 'sent' | 'processed-no-mail' | 'skipped';

async function handleRecipientBucket(args: HandleBucketArgs): Promise<BucketOutcome> {
  const { tx, mailer, config, cadence, recipientId, bucket } = args;

  // Recipient'in güncel `email_mode`'unu yeniden oku (kullanıcı tercihini
  // digest_queued damgalanırken hourly_digest seçmiş, sonra instant'a
  // çekmiş olabilir). Sadece bu cron'a karşılık gelen mod'daki recipient
  // işlenir; aksi durumda bekleyen satırlara dokunmuyoruz (orphan
  // temizliği bu fazda kapsam dışı).
  const [pref] = await tx
    .select({
      emailMode: notificationPreferences.emailMode,
      emailEnabled: notificationPreferences.emailEnabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, recipientId),
        isNull(notificationPreferences.workspaceId),
        isNull(notificationPreferences.boardId),
        isNull(notificationPreferences.cardId),
      ),
    )
    .limit(1);

  const mode = (pref?.emailMode ?? 'instant') as EmailDigestMode;
  const expected: EmailDigestMode = cadence === 'hourly' ? 'hourly_digest' : 'daily_digest';
  if (mode !== expected) {
    // Recipient bu cron'a denk gelmiyor; satırlar başka cron tarafından
    // veya orphan temizleyici tarafından alınır. Sessiz skip.
    return 'skipped';
  }

  // Legacy `email_enabled=false` opt-out → satırlar audit için kapatılır,
  // mail gönderilmez (UI'da `'off'` ile aynı niyet; bu kombinasyonu
  // mevcut kullanıcılar açıkça `off`'a geçince kaybedecek).
  if (pref?.emailEnabled === false) {
    await stampBucketSent(tx, bucket);
    return 'processed-no-mail';
  }

  const [user] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1);
  if (!user) {
    // Recipient hesabı silinmiş — satırları audit damgala, kuyrukta
    // birikme önle.
    await stampBucketSent(tx, bucket);
    return 'processed-no-mail';
  }

  const items: DigestItem[] = bucket.map((row) => ({
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt,
  }));

  const rendered = renderDigestEmail({
    recipient: { name: user.name, email: user.email },
    cadence,
    items,
    appUrl: config.appUrl,
  });

  await mailer.send({
    from: config.from,
    to: user.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  await stampBucketSent(tx, bucket);
  return 'sent';
}

async function stampBucketSent(tx: Database, bucket: DigestRow[]): Promise<void> {
  if (bucket.length === 0) return;
  const ids = bucket.map((row) => row.id);
  await tx
    .update(notificationOutbox)
    .set({
      processedAt: new Date(),
      status: 'sent',
      attempts: sql`${notificationOutbox.attempts} + 1`,
    })
    .where(inArray(notificationOutbox.id, ids));
}
