import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
// `uniqueIndex` is also used for the Faz 6A scheduler dedupe index below.
import { users } from './auth';
import { workspaces } from './workspaces';
import { boards } from './boards';
import { cards } from './cards';
import { activityEvents } from './activity';
import {
  muteLevelEnum,
  notificationChannelEnum,
  notificationTypeEnum,
  outboxStatusEnum,
} from './enums';
import { primaryId, timestamps } from './_common';

/** In-app notifications surfaced in the notification center / badge. */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    recipientId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text().references(() => users.id, { onDelete: 'set null' }),
    type: notificationTypeEnum().notNull(),
    workspaceId: text().references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: text().references(() => cards.id, { onDelete: 'cascade' }),
    // Bildirim detay / audit (2026-06-20) — bu bildirimin doğduğu activity event.
    // Detay ekranı olayın tam payload'ına (before/after) bu bağdan ulaşır; outbox→
    // notification dönüşümünde `notification_outbox.event_id` buraya kopyalanır.
    // Scheduler kaynaklı bildirimlerde (due_*) activity event yok → null kalır.
    activityEventId: text().references(() => activityEvents.id, { onDelete: 'set null' }),
    payload: jsonb().notNull().default({}),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt),
    // Faz 6A (DEM-90) — partial index for the unread-badge count. The previous
    // composite `(recipient_id, read_at)` is kept above for general listing;
    // this partial form makes `SELECT count(*) WHERE read_at IS NULL` cheap.
    index('notifications_recipient_unread_idx')
      .on(t.recipientId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);

/**
 * Per-(user, scope) notification preferences. A row scoped to a workspace,
 * board, or card overrides broader scopes; all-null scope = global default.
 *
 * The `notification_preferences_scope_uq` UNIQUE index (Faz 10B — DEM-136
 * migration `0021_dem136_notification_prefs_unique`) is what makes
 * `notifications.preferences.upsert` race-safe: Postgres treats nullable
 * `workspace_id`/`board_id`/`card_id` columns as distinct in a plain
 * multi-column UNIQUE, so the index uses `COALESCE(col, '')` to fold NULL
 * into a sentinel and serve as the ON CONFLICT target.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text().references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: text().references(() => cards.id, { onDelete: 'cascade' }),
    muteLevel: muteLevelEnum().notNull().default('none'),
    mentionOnly: boolean().notNull().default(false),
    pushEnabled: boolean().notNull().default(true),
    emailEnabled: boolean().notNull().default(true),
    // Faz 10F (DEM-140) — single global quiet-hours window. The three
    // columns travel together (CHECK constraint below); meaningful only on
    // the global-default scope row (workspace/board/card overrides ignore
    // these). See migration `0024_dem140_quiet_hours.sql`.
    quietFrom: time(),
    quietTo: time(),
    quietTimezone: text(),
    // Faz 10H (DEM-142) — kart bazında geçici snooze. `NULL` → snooze yok;
    // `> NOW()` → aktif snooze (rule engine `pickChannels` mute kabul eder,
    // mute-bypass tipler hâlâ geçer); `< NOW()` → süresi dolmuş, satır
    // silinmez (audit). Yalnız card-scope tercih satırında set edilir;
    // global/workspace/board satırlarında set edilse bile rule engine bu
    // alanı yalnız kart kapsamı dahilinde dikkate alır (loadPreference
    // narrowest-scope-wins zaten kart satırını seçer). See migration
    // `0025_dem142_snooze.sql`.
    muteUntil: timestamp({ withTimezone: true }),
    // Faz 10G (DEM-141) — e-posta sıklığı / digest modu. `'instant'` =
    // varsayılan transactional davranış (her bildirim ayrı mail);
    // `'hourly_digest'` / `'daily_digest'` outbox satırını `digest_queued`
    // damgalar (worker özet maili gönderir); `'off'` outbox'a email satırı
    // hiç insert edilmez. Legacy `email_enabled` flag'i geriye dönük
    // korunur — rule engine ikisini AND'ler (`email_enabled=false` veya
    // `email_mode='off'` → kanal kapalı). Mute-bypass tipler (mention +
    // davet) `email_mode` değerinden bağımsız her zaman anlık gider.
    // Yalnız global-default satırında anlamlıdır; workspace/board/card
    // override satırlarında değer tutulsa da digest mantığı global
    // tercihten okur. CHECK constraint migration `0026_dem141_email_digest`
    // ile uygulanır.
    emailMode: text().notNull().default('instant'),
    ...timestamps,
  },
  (t) => [
    index('notification_preferences_user_idx').on(t.userId),
    // Faz 10B (DEM-136) — see migration `0021`. COALESCE-on-nullable scope
    // columns is the only way to make `(NULL, NULL, NULL)` global rows
    // compare equal under UNIQUE. Conflict target on upsert is the same
    // expression list.
    uniqueIndex('notification_preferences_scope_uq').on(
      t.userId,
      sql`COALESCE(${t.workspaceId}, '')`,
      sql`COALESCE(${t.boardId}, '')`,
      sql`COALESCE(${t.cardId}, '')`,
    ),
    // Faz 10F (DEM-140) — all-or-nothing on the quiet-hours triplet so the
    // worker filter never sees a half-configured window.
    check(
      'notification_preferences_quiet_hours_consistency',
      sql`(${t.quietFrom} IS NULL AND ${t.quietTo} IS NULL AND ${t.quietTimezone} IS NULL)
          OR (${t.quietFrom} IS NOT NULL AND ${t.quietTo} IS NOT NULL AND ${t.quietTimezone} IS NOT NULL)`,
    ),
    // Faz 10H (DEM-142) — partial index on snooze: yalnız aktif/dolmuş
    // snooze satırlarını içerir. AccountTabs Section 7 (`aktif snooze`
    // listesi) ve worker filter'ları bu index üzerinden gider; tablo
    // tarama yapmaz. See migration `0025_dem142_snooze.sql`.
    index('notification_preferences_mute_until_idx')
      .on(t.muteUntil)
      .where(sql`${t.muteUntil} IS NOT NULL`),
  ],
);

/**
 * Outbox: rows inserted in the same transaction as the domain change. The
 * worker consumes pending rows → writes `notifications`, pushes Expo/email,
 * updates realtime badges, with retry + dead-letter. See doc §9.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: primaryId(),
    eventId: text().references(() => activityEvents.id, { onDelete: 'set null' }),
    // Bildirim detay / audit (2026-06-20) — push tap'i in-app satıra dokunmakla
    // aynı detay ekranına götürmek için, `in_app` fan-out'ta üretilen
    // `notifications.id` aynı event'in `push` outbox satırına yazılır → push
    // `data.notificationId`. Yalnız push kanalı satırlarında dolu.
    inAppNotificationId: text().references(() => notifications.id, { onDelete: 'set null' }),
    channel: notificationChannelEnum().notNull(),
    // Nullable: an email invitation can target an address with no account yet —
    // the recipient address then lives in `payload.email`. In-app rows always
    // carry a `recipient_id`.
    recipientId: text().references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum().notNull(),
    payload: jsonb().notNull().default({}),
    status: outboxStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    scheduledAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_outbox_status_scheduled_idx').on(t.status, t.scheduledAt),
    index('notification_outbox_recipient_idx').on(t.recipientId),
    // Faz 6A (DEM-90) — sweeper scan over pending rows ordered by age. Partial
    // index keeps it tiny (only rows the worker actually needs to revisit).
    index('notification_outbox_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.processedAt} IS NULL`),
    // Faz 6A (DEM-90) — cooldown 60s pre-check: `SELECT 1 WHERE recipient_id =
    // ? AND type = ? AND created_at > NOW() - INTERVAL '60 seconds'`.
    index('notification_outbox_cooldown_idx').on(t.recipientId, t.type, t.createdAt),
    // Faz 6A (DEM-90) — scheduler rows have `event_id IS NULL` (no
    // activity_events row to FK to) and dedupe via `payload->>'dedupeKey'`.
    // A UNIQUE partial index on the extracted key kills two birds: it makes
    // the per-(card, tier) lookup an index hit (vs. a JSONB-extract scan
    // over the full outbox), and the uniqueness closes the TOCTOU race when
    // two scheduler ticks (HA worker / retry overlap) classify the same
    // card at the same time — the insert path uses `ON CONFLICT DO NOTHING`.
    uniqueIndex('notification_outbox_scheduler_dedupe_uq')
      .on(sql`(${t.payload} ->> 'dedupeKey')`)
      .where(sql`${t.eventId} IS NULL AND ${t.payload} ? 'dedupeKey'`),
    // Faz 10G (DEM-141) — digest worker `recipient_id`'ye göre toplu okur:
    // `WHERE status='digest_queued' AND processed_at IS NULL` partial
    // index, recipient × created_at sıralı tarama yapılmasına izin verir.
    // Migration `0026_dem141_email_digest.sql` ile yaratılır.
    index('notification_outbox_digest_queued_idx')
      .on(t.recipientId, t.createdAt)
      .where(sql`${t.status} = 'digest_queued' AND ${t.processedAt} IS NULL`),
  ],
);

/**
 * Device push tokens (Expo). Faz 6B (DEM-91) — finalised schema:
 *  - `platform` is `NOT NULL` + CHECK constraint (`ios`/`android`/`web`).
 *  - `token` is globally `UNIQUE` (the same Expo token never belongs to two
 *    users — `register` with a duplicate token reactivates the existing row,
 *    not inserts a new one).
 *  - `revoked_at` replaces the old `active` boolean: a logout or an
 *    `expo-server-sdk` `DeviceNotRegistered` error stamps it instead of
 *    deleting the row (audit retention).
 *  - `device_name` is an optional human label (e.g. "Abdullah'ın iPhone")
 *    surfaced in the mobile "logged-in devices" list (Faz 7).
 *  - Partial index on `(user_id) WHERE revoked_at IS NULL` keeps the
 *    "active tokens for user" lookup cheap (the push processor reads it on
 *    every notification).
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    platform: text().notNull(),
    deviceName: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_tokens_token_uq').on(t.token),
    index('push_tokens_user_active_idx')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
    check('push_tokens_platform_check', sql`${t.platform} IN ('ios','android','web')`),
  ],
);

/**
 * Expo push receipts — Faz 6B follow-up (push-receipt-polling).
 *
 * `sendPushNotificationsAsync` only returns *tickets* ("Expo accepted the
 * message"). Actual APNs/FCM delivery success/failure is reported later via
 * *receipts*, fetched by ticket id with `getPushNotificationReceiptsAsync`
 * (Expo holds them ~24h, ready a few minutes after send). Without polling
 * them, a `DeviceNotRegistered` / `InvalidCredentials` / `MessageTooBig`
 * delivery failure is invisible and dead tokens never get pruned — the exact
 * blind spot behind the 2026-05-31 push incident.
 *
 * The push processor inserts one row per `status:'ok'` ticket; the
 * `notification-push-receipts` cron drains unchecked rows older than the
 * settle window, revokes tokens Expo reports as `DeviceNotRegistered`, logs
 * other delivery errors, and stamps `checked_at`.
 */
export const pushReceipts = pgTable(
  'push_receipts',
  {
    id: primaryId(),
    // Expo ticket id — the key passed back to `getPushNotificationReceiptsAsync`.
    ticketId: text().notNull(),
    pushTokenId: text()
      .notNull()
      .references(() => pushTokens.id, { onDelete: 'cascade' }),
    // Audit trail back to the originating outbox row (nullable: the outbox row
    // may be retention-pruned before the receipt is polled).
    outboxId: text().references(() => notificationOutbox.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // NULL → receipt not yet polled. The cron stamps this once Expo returns a
    // verdict (ok or error), so the partial index below stays tiny.
    checkedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Poll scan: unchecked receipts oldest-first. Partial index keeps it to
    // only the rows the cron still owes a lookup.
    index('push_receipts_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.checkedAt} IS NULL`),
    index('push_receipts_token_idx').on(t.pushTokenId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
export type PushReceipt = typeof pushReceipts.$inferSelect;
