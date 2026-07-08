import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards, labels } from './boards';
import { lists } from './lists';
import { attachments } from './comments';
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
    /** Card-completion state (Phase 2.7 — DEM-66). */
    completed: boolean().notNull().default(false),
    /** When the card was marked complete (timestamptz); `null` when not completed. */
    completedAt: timestamp({ withTimezone: true }),
    /** Who marked the card complete; `set null` on user delete. */
    completedBy: text().references(() => users.id, { onDelete: 'set null' }),
    /**
     * Optional card cover colour (Phase 2.7 — DEM-67): one of the 12 palette
     * names (`@pusula/domain` `CARD_COVER_COLORS`). Plain `text` like
     * `labels.color` — no DB CHECK; validated in the API/domain layer.
     */
    coverColor: text(),
    /** Selected image attachment to use as the card cover (DEM-110). */
    coverImageAttachmentId: text().references((): AnyPgColumn => attachments.id, {
      onDelete: 'set null',
    }),
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
    /** Checklist arşivleme (invariant 23): `null` = aktif, timestamp = arşivli. */
    archivedAt: archivedAt(),
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
    /**
     * İç içe (nested) madde ebeveyni (DEM — 3 seviye). `null` = kök (üst düzey)
     * madde; doluysa aynı checklist içindeki başka bir maddenin id'si. Kendi
     * kendine referans; ebeveyn silinince tüm alt ağaç `cascade` ile birlikte
     * silinir. `position` yalnız aynı ebeveyn (kardeşler) arasında anlamlıdır.
     */
    parentItemId: text().references((): AnyPgColumn => checklistItems.id, {
      onDelete: 'cascade',
    }),
    /**
     * Ağaç derinliği: kök = 0, çocuk = 1, torun = 2 (`CHECKLIST_MAX_DEPTH` = 3
     * seviye). `create` sırasında `parent.depth + 1` ile yazılır ve sabit kalır
     * (aynı-seviye reorder ebeveyni değiştirmez). Girinti + derinlik sınırı
     * kontrolü bu kolondan O(1) okunur (ebeveyn zinciri yürünmez).
     */
    depth: integer().notNull().default(0),
    content: text().notNull(),
    position: text().notNull(),
    completed: boolean().notNull().default(false),
    completedAt: timestamp({ withTimezone: true }),
    completedBy: text().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('checklist_items_checklist_position_idx').on(t.checklistId, t.position),
    // Kardeş (aynı ebeveyn) append pozisyonu + alt ağaç okuması bu index'i kullanır.
    index('checklist_items_parent_position_idx').on(t.parentItemId, t.position),
  ],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardMember = typeof cardMembers.$inferSelect;
export type Checklist = typeof checklists.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
