import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { boards } from './boards';
import { searchEntityTypeEnum } from './enums';
import { primaryId } from './_common';

/**
 * Denormalized search index (MVP: PostgreSQL FTS — see doc §15). The `tsvector`
 * column + GIN index + maintenance trigger are added in a dedicated migration
 * during the search phase; until then results can be served via simple ILIKE
 * over `title`/`body`. Moving to Meilisearch later replaces the query path, not
 * this table.
 */
export const searchDocuments = pgTable(
  'search_documents',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: text().references(() => boards.id, { onDelete: 'cascade' }),
    entityType: searchEntityTypeEnum().notNull(),
    /** Id of the indexed entity (card id, comment id, ...). */
    entityId: text().notNull(),
    title: text().notNull().default(''),
    body: text().notNull().default(''),
    /** Space-joined label names for quick filtering until FTS lands. */
    labels: text().notNull().default(''),
    archivedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_documents_workspace_idx').on(t.workspaceId),
    index('search_documents_board_idx').on(t.boardId),
    uniqueIndex('search_documents_entity_uq').on(t.entityType, t.entityId),
  ],
);

export type SearchDocument = typeof searchDocuments.$inferSelect;
