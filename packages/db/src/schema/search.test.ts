import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { searchDocuments } from './search';

describe('searchDocuments table', () => {
  it('matches the Faz 6.5 FTS column contract', () => {
    const columns = getTableColumns(searchDocuments) as Record<string, any>;

    expect(Object.keys(columns)).toEqual([
      'id',
      'workspaceId',
      'boardId',
      'cardId',
      'entityType',
      'entityId',
      'title',
      'body',
      'labels',
      'searchVector',
      'archivedAt',
      'updatedAt',
    ]);
    expect(columns.cardId?.getSQLType()).toBe('text');
    expect(columns.body?.notNull).toBe(false);
    expect(columns.labels?.getSQLType()).toBe('text[]');
    expect(columns.searchVector?.getSQLType()).toBe('tsvector');
  });

  it('exposes scope, entity uniqueness and FTS indexes', () => {
    const config = getTableConfig(searchDocuments);
    const indexes = config.indexes.map((indexBuilder: any) => indexBuilder.config);

    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
      'search_documents_workspace_idx',
      'search_documents_board_idx',
      'search_documents_card_idx',
      'search_documents_entity_uq',
      'search_documents_active_scope_idx',
      'search_documents_search_vector_gin_idx',
    ]));
    expect(indexes.find((index) => index.name === 'search_documents_search_vector_gin_idx')?.method).toBe('gin');
    expect(indexes.find((index) => index.name === 'search_documents_active_scope_idx')?.where).toBeDefined();
  });
});

describe('DEM-104 migration', () => {
  it('activates search_documents without dropping existing data', () => {
    const migrationPath = resolve(import.meta.dirname, '../../drizzle/0016_dem104_search_documents_fts.sql');

    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(`ALTER TYPE "public"."search_entity_type" ADD VALUE 'list'`);
    expect(migration).toContain(`ALTER TABLE "search_documents" ADD COLUMN "card_id" text`);
    expect(migration).toContain(`ALTER TABLE "search_documents" ADD COLUMN "search_vector" tsvector`);
    expect(migration).toContain(`ALTER TABLE "search_documents" ALTER COLUMN "labels" TYPE text[]`);
    expect(migration).toContain(`CREATE INDEX "search_documents_search_vector_gin_idx" ON "search_documents" USING gin ("search_vector")`);
  });
});
