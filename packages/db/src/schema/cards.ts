import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards, labels } from './boards';
import { lists } from './lists';
import { cardRoleEnum } from './enums';
import { archivedAt, primaryId, timestamps } from './_common';

export const cards = pgTable(
  'cards',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    listId: text()
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    /** LexoRank-like fractional position string within `listId`. */
    position: text().notNull(),
    dueAt: timestamp({ withTimezone: true }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index('cards_list_position_idx').on(t.listId, t.position),
    index('cards_board_idx').on(t.boardId),
  ],
);

export const cardMembers = pgTable(
  'card_members',
  {
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `assignee` or `watcher` — see architecture doc §10. */
    role: cardRoleEnum().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId, t.role] }),
    index('card_members_user_idx').on(t.userId),
  ],
);

export const cardLabels = pgTable(
  'card_labels',
  {
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    labelId: text()
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.labelId] }),
    index('card_labels_label_idx').on(t.labelId),
  ],
);

export const checklists = pgTable(
  'checklists',
  {
    id: primaryId(),
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    position: text().notNull(),
    ...timestamps,
  },
  (t) => [index('checklists_card_position_idx').on(t.cardId, t.position)],
);

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: primaryId(),
    checklistId: text()
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    content: text().notNull(),
    position: text().notNull(),
    completed: boolean().notNull().default(false),
    completedAt: timestamp({ withTimezone: true }),
    completedBy: text().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('checklist_items_checklist_position_idx').on(t.checklistId, t.position)],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardMember = typeof cardMembers.$inferSelect;
export type Checklist = typeof checklists.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
