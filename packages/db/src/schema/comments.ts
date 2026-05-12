import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards } from './boards';
import { cards } from './cards';
import { primaryId, timestamps } from './_common';

export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    authorId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('comments_card_created_idx').on(t.cardId, t.createdAt)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: primaryId(),
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    uploaderId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** S3/MinIO object key. */
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    size: bigint({ mode: 'number' }).notNull(),
    ...timestamps,
  },
  (t) => [index('attachments_card_idx').on(t.cardId)],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
