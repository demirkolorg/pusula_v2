import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
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
    ...timestamps,
  },
  (t) => [index('notification_preferences_user_idx').on(t.userId)],
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

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
