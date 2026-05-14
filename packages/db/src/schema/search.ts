import { sql } from 'drizzle-orm';
import { customType, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { boards } from './boards';
import { cards } from './cards';
import { searchEntityTypeEnum } from './enums';
import { primaryId } from './_common';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Denormalized search index (Faz 6.5 / DEM-104). Source tables remain the
 * authority; this table is a permission-filterable read model for PostgreSQL
 * full-text search.
 */
export const searchDocuments = pgTable(
  'search_documents',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: text().references(() => cards.id, { onDelete: 'cascade' }),
    entityType: searchEntityTypeEnum().notNull(),
    /** Id of the indexed entity (card id, comment id, ...). */
    entityId: text().notNull(),
    title: text().notNull().default(''),
    body: text(),
    labels: text().array().notNull().default(sql`ARRAY[]::text[]`),
    searchVector: tsvector('search_vector').notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_documents_workspace_idx').on(t.workspaceId),
    index('search_documents_board_idx').on(t.boardId),
    index('search_documents_card_idx').on(t.cardId),
    uniqueIndex('search_documents_entity_uq').on(t.entityType, t.entityId),
    index('search_documents_active_scope_idx')
      .on(t.workspaceId, t.boardId, t.entityType, t.updatedAt)
      .where(sql`${t.archivedAt} IS NULL`),
    index('search_documents_search_vector_gin_idx').using('gin', t.searchVector),
  ],
);

export type SearchDocument = typeof searchDocuments.$inferSelect;
export type NewSearchDocument = typeof searchDocuments.$inferInsert;
