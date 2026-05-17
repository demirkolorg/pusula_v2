import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards } from './boards';

/**
 * Per-user board favorites. A pure junction table (no `boards.starred` boolean)
 * mirroring the `board_members` / `card_members` shape: a favorite is set by a
 * single user for a single board and never mutated, so only `created_at` is
 * tracked — no `updated_at`. The composite primary key `(board_id, user_id)`
 * makes the `setFavorite` mutation idempotent at the database level.
 */
export const boardFavorites = pgTable(
  'board_favorites',
  {
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    index('board_favorites_user_idx').on(t.userId),
  ],
);

export type BoardFavorite = typeof boardFavorites.$inferSelect;
export type NewBoardFavorite = typeof boardFavorites.$inferInsert;
