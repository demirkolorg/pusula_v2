import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaces } from './workspaces';
import { boards } from './boards';
import { cards } from './cards';
import { activityEventTypeEnum, outboxStatusEnum } from './enums';
import { primaryId } from './_common';

/** Append-only history of domain mutations. Written inside the same transaction as the change. */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: text().references(() => cards.id, { onDelete: 'cascade' }),
    actorId: text().references(() => users.id, { onDelete: 'set null' }),
    type: activityEventTypeEnum().notNull(),
    payload: jsonb().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_events_board_created_idx').on(t.boardId, t.createdAt),
    index('activity_events_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('activity_events_card_created_idx').on(t.cardId, t.createdAt),
  ],
);

/**
 * Realtime event outbox. Rows are inserted in the same transaction as the
 * domain change; an after-commit publisher / worker reads pending rows and
 * publishes to Socket.IO rooms, then marks them sent. `sequence` is a global
 * monotonic counter so clients can detect missed events. See doc §8.
 */
export const realtimeEvents = pgTable(
  'realtime_events',
  {
    id: primaryId(),
    sequence: bigserial({ mode: 'number' }).notNull(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: text().references(() => cards.id, { onDelete: 'cascade' }),
    actorId: text().references(() => users.id, { onDelete: 'set null' }),
    type: text().notNull(),
    payload: jsonb().notNull().default({}),
    clientMutationId: text(),
    status: outboxStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('realtime_events_status_idx').on(t.status),
    index('realtime_events_board_sequence_idx').on(t.boardId, t.sequence),
  ],
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
export type RealtimeEventRow = typeof realtimeEvents.$inferSelect;
