import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
    index('notifications_recipient_unread_idx').on(t.recipientId, t.readAt),
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
    recipientId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  ],
);

/** Device push tokens (Expo). Deactivated on logout. */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    platform: text(), // 'ios' | 'android'
    active: boolean().notNull().default(true),
    lastUsedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('push_tokens_user_idx').on(t.userId), index('push_tokens_token_idx').on(t.token)],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
