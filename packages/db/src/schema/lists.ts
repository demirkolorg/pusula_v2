import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { boards } from './boards';
import { archivedAt, primaryId, timestamps } from './_common';

export const lists = pgTable(
  'lists',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    /**
     * LexoRank-like fractional position string (NOT an integer). Inserting
     * between two lists only mutates the moved row. See architecture doc §5.
     */
    position: text().notNull(),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [index('lists_board_position_idx').on(t.boardId, t.position)],
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
