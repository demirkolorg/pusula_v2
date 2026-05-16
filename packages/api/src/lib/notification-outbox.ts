/**
 * Notification outbox insert + producer plumbing — Faz 6A (DEM-90).
 *
 * Sister module to `realtime-publish.ts` (Faz 5B): each notification-producing
 * activity event is mirrored into `notification_outbox`, the worker
 * (`apps/worker` `pusula-notifications` queue) consumes the rows, fans out to
 * in-app / email / push, and stamps `processed_at`. After the tx commits, the
 * mutation hands the `eventId` off to a best-effort BullMQ producer. The
 * periodic sweeper (`apps/worker/src/jobs/notification-publish-sweeper.ts`)
 * picks up rows the enqueue missed.
 *
 * Two responsibilities sit here, not in the rule engine:
 *  1. Cooldown 60 s — same `(recipient_id, type)` row inside the window? Skip
 *     silently. Three notification types bypass the cooldown:
 *       - `mention` (every mention is its own load-bearing signal)
 *       - `board_invitation` / `workspace_invitation` (each token is unique)
 *       - `due_approaching` / `due_overdue` (the scheduler already dedupes)
 *  2. Multi-channel fan-out — the rule produces one row per `(recipient,
 *     channel)`; we insert each as its own outbox row so the worker can
 *     channel-route via the `channel` column (Faz 6B's email + push
 *     processors filter on `WHERE channel = 'email'` / `'push'`).
 *
 * The DB row is the source of truth: `event_id` (= `activity_events.id`) gives
 * the worker the activity context to read; the outbox `payload` carries the
 * notification-specific data the rule engine baked in (so the worker doesn't
 * have to re-derive it). `processed_at` is the idempotency anchor — a re-run
 * that finds it `NOT NULL` is a no-op.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Notification processor
 * (Faz 6)" and `docs/domain/04-bildirim-kurallari.md`.
 */
import {
  and,
  eq,
  gt,
  isNull,
  ne,
  notificationOutbox,
  notificationPreferences,
  sql,
} from '@pusula/db';
import type { Database } from '@pusula/db';
import type { EmailDigestMode, NotificationType } from '@pusula/domain';
import type { Queryable } from '../middleware/board-access';
import type { ActivityEventForRules, NotificationRule } from './notification-rules';
import { computeNotifications } from './notification-rules';

/** The minimal transaction-or-db handle the helper needs. */
type Tx = Pick<Database, 'select' | 'insert'>;

/** Host-supplied, best-effort enqueue hook (Redis errors must be swallowed by the host). */
export type EnqueueNotificationPublish = (args: { eventId: string }) => void | Promise<void>;

/** Cooldown window for `(recipient, type)` duplicate suppression. Seconds. */
export const NOTIFICATION_COOLDOWN_SECONDS = 60;

/**
 * Notification types that skip the 60 s cooldown — each carries unique
 * information that callers would notice missing if collapsed. See
 * `docs/domain/04-bildirim-kurallari.md` "Cooldown" → "İstisnalar".
 */
const COOLDOWN_BYPASS = new Set<NotificationType>([
  'mention',
  'board_invitation',
  'workspace_invitation',
  'due_approaching',
  'due_overdue',
  // DEM-154 — her board erişim talebi ayrı bir kişi + ayrı bir aksiyon;
  // 60 s içinde gelen ikinci talep sahibi collapse edilirse admin'den
  // gizlenir. `board_invitation` ile aynı gerekçe.
  'board_access_requested',
]);

/**
 * Faz 10G (DEM-141) — e-posta digest **mute-bypass** tipler. Recipient
 * `email_mode` ne olursa olsun şu tipler **anlık** gönderilir (`'instant'`
 * davranışı uygulanır), digest worker'a düşürülmez:
 *  - `mention`               — her @ kritik sinyal; kullanıcı geç fark
 *                              ederse anlam kaybeder.
 *  - `board_invitation`      — davet token'ı tek-kullanımlık + zaman
 *                              hassasiyetli; toplu özet kabul edilemez.
 *  - `workspace_invitation`  — aynı disiplin.
 *
 * Listenin kaynağı: `notification-rules.ts:pickChannels` mute-bypass set'i
 * + domain `04-bildirim-kurallari.md` "Mute-bypass" tablosu. İkisinin
 * senkron kalması gerek; testler bağlar.
 */
const DIGEST_BYPASS = new Set<NotificationType>([
  'mention',
  'board_invitation',
  'workspace_invitation',
]);

/** Inputs `insertNotificationOutbox` accepts — one rule = one outbox row. */
export interface InsertNotificationOutboxInput {
  rule: NotificationRule;
  /** `activity_events.id` — the worker reads this for context (joins, audit). */
  eventId: string;
}

export type InsertOutcome =
  | { inserted: true; outboxId: string; status: 'pending' | 'digest_queued' }
  | { inserted: false; reason: 'cooldown' | 'email_mode_off' };

/**
 * Faz 10G (DEM-141) — recipient'in global preference satırından `email_mode`
 * okur. Sadece **global** satıra bakar (workspace/board/card override
 * satırlarında bu alan tutulsa da digest mantığı global tercihten okur,
 * Zod schema scope override'da `'instant'` haricini reddediyor). Satır
 * yoksa varsayılan `'instant'` — mevcut transactional davranış.
 */
async function readEmailMode(tx: Tx, recipientUserId: string): Promise<EmailDigestMode> {
  const [row] = await tx
    .select({ emailMode: notificationPreferences.emailMode })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, recipientUserId),
        isNull(notificationPreferences.workspaceId),
        isNull(notificationPreferences.boardId),
        isNull(notificationPreferences.cardId),
      ),
    )
    .limit(1);
  const mode = (row?.emailMode ?? 'instant') as EmailDigestMode;
  return mode;
}

/**
 * Insert a single `notification_outbox` row inside the caller's transaction.
 * Runs the cooldown pre-check (unless the type bypasses it), inserts the row,
 * and returns the resulting id (or a `cooldown` skip marker).
 *
 * The caller is expected to call `maybeEnqueueNotificationPublish(ctx,
 * eventId)` *after* the tx commits — fire-and-forget; the periodic sweeper in
 * `apps/worker` picks up any rows the enqueue missed.
 */
export async function insertNotificationOutbox(
  tx: Tx,
  input: InsertNotificationOutboxInput,
): Promise<InsertOutcome> {
  const { rule, eventId } = input;

  // Cooldown 60 s pre-check (`comment.mentioned` + invitations + due reminders
  // bypass). The window is `(recipient, type)`-scoped *and* excludes rows
  // produced by the same activity event — multi-channel fan-out for one
  // event writes three rows (in_app/email/push) in the same call, so the
  // second + third insert would otherwise see the first as "recent" and
  // skip themselves. Two different activity events firing the same
  // `(recipient, type)` within 60 s collapses to the first one, exactly as
  // the domain doc requires. The partial composite index
  // `(recipient_id, type, created_at)` makes this an index-only lookup.
  //
  // NB scheduler rows (event_id IS NULL): `ne(NULL, anyValue) → NULL`, so
  // SQL three-valued logic filters them out of this check — fine, the
  // scheduler runs its own (card, tier) dedupe via the partial UNIQUE
  // index `notification_outbox_scheduler_dedupe_uq`. An activity-fired
  // notification 30 s after a scheduler-fired one therefore proceeds (it's
  // a different *signal*, not a duplicate).
  if (!COOLDOWN_BYPASS.has(rule.type)) {
    const recent = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.recipientId, rule.recipientUserId),
          eq(notificationOutbox.type, rule.type),
          ne(notificationOutbox.eventId, eventId),
          gt(
            notificationOutbox.createdAt,
            sql`NOW() - (${NOTIFICATION_COOLDOWN_SECONDS} * INTERVAL '1 second')`,
          ),
        ),
      )
      .limit(1);
    if (recent.length > 0) {
      return { inserted: false, reason: 'cooldown' };
    }
  }

  // Faz 10G (DEM-141) — e-posta kanalı için recipient'in `email_mode`
  // tercihini damgalama aşamasında uygula. Mute-bypass tipler (mention +
  // davet) her durumda anlık gider. `'off'` ise email satırı insert
  // edilmez (sessizce skip — UI'da net seçim). Digest mod'larda satır
  // `digest_queued` damgalanır; 6A publish processor bunu görür ve email
  // kanal kuyruğuna push etmez (`notification-publish.ts:dispatchOutboxRow`).
  let status: 'pending' | 'digest_queued' = 'pending';
  if (rule.channel === 'email' && !DIGEST_BYPASS.has(rule.type)) {
    const emailMode = await readEmailMode(tx, rule.recipientUserId);
    if (emailMode === 'off') {
      return { inserted: false, reason: 'email_mode_off' };
    }
    if (emailMode === 'hourly_digest' || emailMode === 'daily_digest') {
      status = 'digest_queued';
    }
  }

  const [row] = await tx
    .insert(notificationOutbox)
    .values({
      eventId,
      channel: rule.channel,
      recipientId: rule.recipientUserId,
      type: rule.type,
      payload: rule.payload,
      status,
    })
    .returning({ id: notificationOutbox.id });
  if (!row) throw new Error('notification_outbox insert returned no row');
  return { inserted: true, outboxId: row.id, status };
}

/** Minimal slice of the tRPC context this helper needs. */
interface CtxWithEnqueue {
  enqueueNotificationPublish?: EnqueueNotificationPublish;
}

/**
 * Best-effort enqueue helper — fires `ctx.enqueueNotificationPublish({
 * eventId })` iff the host wired it. Centralises the null-check so mutation
 * gövdeleri stays one-liners.
 */
export function maybeEnqueueNotificationPublish(
  ctx: CtxWithEnqueue,
  eventId: string | undefined,
): void {
  if (!eventId) return;
  if (!ctx.enqueueNotificationPublish) return;
  void ctx.enqueueNotificationPublish({ eventId });
}

/**
 * Convenience wrapper — runs the rule engine and inserts every produced row.
 * Mutation gövdeleri call this right after their `activity_events` insert,
 * inside the same transaction. Returns the *count* of rows inserted
 * (excluding cooldown skips) so the caller can decide whether enqueueing the
 * publish job is worth it — if zero rows were inserted, there's nothing for
 * the worker to do.
 */
export async function dispatchNotificationsForActivity(
  tx: Tx & Queryable,
  activityEvent: ActivityEventForRules,
): Promise<{ inserted: number; skipped: number }> {
  const rules = await computeNotifications(tx, activityEvent);
  if (rules.length === 0) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;
  for (const rule of rules) {
    // Faz 10G (DEM-141): cooldown + email_mode_off skip'leri tek sayaca
    // düşer — caller'a fan-out sayısı gerek, hangi sebepten skip
    // edildiği test ve log seviyesinde önemli ama mutation gövdesinde
    // yalnız fan-out adedi kullanılır.
    const outcome = await insertNotificationOutbox(tx, {
      rule,
      eventId: activityEvent.id,
    });
    if (outcome.inserted) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}
