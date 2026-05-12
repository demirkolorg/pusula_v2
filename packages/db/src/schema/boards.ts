import { index, integer, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaces } from './workspaces';
import { boardRoleEnum } from './enums';
import { archivedAt, primaryId, timestamps } from './_common';

export const boards = pgTable(
  'boards',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    /** Monotonic counter bumped on every board mutation; lets clients detect missed realtime events. */
    version: integer().notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [index('boards_workspace_idx').on(t.workspaceId)],
);

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: boardRoleEnum().notNull().default('member'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] }), index('board_members_user_idx').on(t.userId)],
);

export const labels = pgTable(
  'labels',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text().notNull().default(''),
    /** Tailwind-ish token, e.g. `green`, `blue-600`. */
    color: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index('labels_board_idx').on(t.boardId),
    uniqueIndex('labels_board_color_name_uq').on(t.boardId, t.color, t.name),
  ],
);

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type BoardMember = typeof boardMembers.$inferSelect;
export type Label = typeof labels.$inferSelect;
