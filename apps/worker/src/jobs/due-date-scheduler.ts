/**
 * Due-date scheduler — Faz 6A (DEM-90).
 *
 * Periodic job (5-min cron) that scans `cards` for upcoming/overdue dues and
 * writes `notification_outbox` rows so the next `pusula-notifications` tick
 * picks them up + fans them out to the card's watcher pool. Three reminder
 * tiers per card:
 *   - `due_reminder_1d` — due within the next 24 h, not yet inside the 1 h
 *     window.
 *   - `due_reminder_1h` — due within the next hour.
 *   - `due_overdue`    — due_at < NOW() (sent once when it tips over).
 *
 * Dedupe is per-card-per-tier — we use a stable sentinel `event_id` (`due:
 * {tier}:{cardId}`) so a re-run inside the same 5 min tick finds the row from
 * the previous tick and skips. The sentinel is *not* a real
 * `activity_events.id` — the FK column is `ON DELETE SET NULL` and accepts an
 * arbitrary text value; cleanup runs in the retention job (Faz 8) so the
 * sentinels naturally age out.
 *
 * The notification-rules engine is bypassed for these reminders — there's no
 * triggering activity event (a due deadline isn't a user action). Instead, we
 * fan out directly to `card_members` (assignee + watcher), filtered to users
 * who still have effective board access. Channels honour
 * `notification_preferences` for the card / board / workspace scope (workspace
 * default ON for push + email on `due_reminder_*`).
 *
 * Out of scope here: actually sending the email / push (Faz 6B); the in-app
 * fan-out happens via the existing `pusula-notifications` worker once the
 * outbox row exists.
 */
import { and, eq, isNotNull, isNull, notificationOutbox, sql } from '@pusula/db';
import {
  boards,
  cardMembers,
  cards,
  lists,
  notificationPreferences,
  workspaceMembers,
} from '@pusula/db';
import type { Database } from '@pusula/db';
import type { NotificationChannel, NotificationType } from '@pusula/domain';

/** Repeatable job name registered against `pusula-scheduled` queue. */
export const DUE_DATE_SCHEDULER_JOB_NAME = 'due-date-scheduler';

/** How often the scheduler ticks (BullMQ `repeat.every`). */
export const DUE_DATE_SCHEDULER_INTERVAL_MS = 5 * 60_000;

/** Cap on cards scanned per tick (keeps memory bounded under load). */
export const DUE_DATE_SCHEDULER_BATCH = 2_000;

type ReminderTier = 'due_reminder_1d' | 'due_reminder_1h' | 'due_overdue';

interface CardRow {
  id: string;
  title: string;
  boardId: string;
  workspaceId: string;
  dueAt: Date;
}

/**
 * Run one scheduler tick. Returns `{ scanned, written }` for logs. `now` is
 * injectable for tests — production passes `new Date()`.
 */
export async function runDueDateScheduler(
  db: Database,
  enqueueNotificationPublish: (eventId: string) => Promise<void> | void,
  now: Date = new Date(),
): Promise<{ scanned: number; written: number }> {
  // Candidate cards: have a due date, active (not archived, not completed),
  // and their list + board are also active. The 30-day forward window is wide
  // enough to catch every 24 h candidate while keeping the scan tight.
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const candidates = (await db
    .select({
      id: cards.id,
      title: cards.title,
      boardId: cards.boardId,
      workspaceId: boards.workspaceId,
      dueAt: cards.dueAt,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, cards.boardId))
    .where(
      and(
        isNotNull(cards.dueAt),
        isNull(cards.archivedAt),
        eq(cards.completed, false),
        isNull(lists.archivedAt),
        isNull(boards.archivedAt),
        sql`${cards.dueAt} < ${horizon}`,
      ),
    )
    .limit(DUE_DATE_SCHEDULER_BATCH)) as CardRow[];

  let written = 0;
  for (const card of candidates) {
    const tier = classifyReminderTier(card.dueAt, now);
    if (!tier) continue;
    // `notification_outbox.event_id` FKs to `activity_events.id` — there's no
    // activity row for a scheduler-fired reminder, so we leave `event_id`
    // NULL and dedupe via the payload key `dedupeKey` (one row per
    // `(card, tier)` regardless of channel). The UNIQUE partial index
    // `notification_outbox_scheduler_dedupe_uq` (migration 0011) makes the
    // dedupe race-safe — the per-channel inserts below use
    // `ON CONFLICT DO NOTHING` and rely on Postgres to enforce uniqueness
    // on `(payload->>'dedupeKey') WHERE event_id IS NULL`.
    const dedupeKey = `due:${tier}:${card.id}`;

    // Fan out per card member, per channel. Skips members without effective
    // board access (the simpler permission check than the rule engine's —
    // a board's `card_members` are already gated by the same invariant).
    const memberRows = await db
      .select({ userId: cardMembers.userId })
      .from(cardMembers)
      .where(eq(cardMembers.cardId, card.id));
    if (memberRows.length === 0) continue;

    const wsRows = await db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, card.workspaceId));
    const wsRole = new Map(wsRows.map((r) => [r.userId, r.role] as const));

    const notificationType: NotificationType =
      tier === 'due_overdue' ? 'due_overdue' : 'due_approaching';

    let wroteForThisCard = false;
    await db.transaction(async (tx) => {
      for (const m of memberRows) {
        if (!wsRole.has(m.userId)) continue; // workspace membership revoked
        const channels = await pickDueChannels(tx, m.userId, card, notificationType);
        for (const channel of channels) {
          // `ON CONFLICT DO NOTHING` on the partial unique index
          // `(payload->>'dedupeKey') WHERE event_id IS NULL` — closes the
          // TOCTOU race when two scheduler instances classify the same card
          // at the same minute. `returning({ id })` is empty when a row
          // already existed.
          const inserted = await tx
            .insert(notificationOutbox)
            .values({
              eventId: null,
              channel,
              recipientId: m.userId,
              type: notificationType,
              payload: {
                activityType: tier,
                notificationType,
                cardId: card.id,
                cardTitle: card.title,
                boardId: card.boardId,
                workspaceId: card.workspaceId,
                dueAt: card.dueAt,
                reminderTier: tier,
                dedupeKey,
              },
            })
            .onConflictDoNothing()
            .returning({ id: notificationOutbox.id });
          if (inserted.length > 0) wroteForThisCard = true;
        }
      }
    });

    if (wroteForThisCard) {
      written++;
    }
  }

  // After scanning every candidate: trigger one publish job to drain *all*
  // newly-written scheduler rows. The processor accepts `eventId: 'scheduler:tick'`
  // sentinel which it translates to `WHERE event_id IS NULL AND
  // processed_at IS NULL`. Best-effort — the sweeper picks them up if this
  // enqueue fails.
  if (written > 0) {
    try {
      // Sentinel — `notification-publish.ts` `SCHEDULER_TICK_EVENT_ID`.
      await enqueueNotificationPublish('scheduler:tick');
    } catch (err) {
      console.warn(
        '[worker:due-scheduler] sentinel enqueue failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { scanned: candidates.length, written };
}

function classifyReminderTier(dueAt: Date, now: Date): ReminderTier | null {
  const diffMs = dueAt.getTime() - now.getTime();
  if (diffMs <= 0) return 'due_overdue';
  if (diffMs <= 60 * 60_000) return 'due_reminder_1h';
  if (diffMs <= 24 * 60 * 60_000) return 'due_reminder_1d';
  return null;
}

/**
 * Channel picker for due-date reminders. Walks the same narrowest-scope-wins
 * `notification_preferences` hierarchy as the rule engine, but knows the
 * reminder defaults: in_app always; push + email opt-in (default ON). Mute
 * bypass: due reminders ignore `mute_level=all` to surface deadline pressure
 * — the user can disable per-card watching to opt out entirely.
 */
async function pickDueChannels(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  userId: string,
  card: { boardId: string; workspaceId: string; id: string },
  notificationType: NotificationType,
): Promise<NotificationChannel[]> {
  const rows = await tx
    .select({
      pushEnabled: notificationPreferences.pushEnabled,
      emailEnabled: notificationPreferences.emailEnabled,
      workspaceId: notificationPreferences.workspaceId,
      boardId: notificationPreferences.boardId,
      cardId: notificationPreferences.cardId,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  // Narrowest-scope-wins. Mute-bypass means we skip the muteLevel/mentionOnly
  // gates here — only the channel toggles apply.
  let pushEnabled = true;
  let emailEnabled = true;
  let bestScore = 0;
  for (const row of rows) {
    let score = 0;
    if (row.cardId && row.cardId === card.id) score = 4;
    else if (row.boardId && row.boardId === card.boardId) score = 3;
    else if (row.workspaceId && row.workspaceId === card.workspaceId) score = 2;
    else if (!row.workspaceId && !row.boardId && !row.cardId) score = 1;
    if (score > bestScore) {
      bestScore = score;
      pushEnabled = row.pushEnabled;
      emailEnabled = row.emailEnabled;
    }
  }

  const channels: NotificationChannel[] = ['in_app'];
  if (pushEnabled) channels.push('push');
  // Email by tier: `due_overdue` only (lower tiers go in-app + push only to
  // keep email volume manageable — see `04-bildirim-kurallari.md`).
  if (emailEnabled && notificationType === 'due_overdue') channels.push('email');
  return channels;
}
