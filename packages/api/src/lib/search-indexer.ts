/**
 * Search indexer facade (Faz 6.5B / DEM-105).
 *
 * Mutation bodies import this module so the request path stays in `packages/api`.
 * The implementation lives in `@pusula/db/search-indexer` because the worker
 * reindex job uses the same table resolver without depending on the tRPC package.
 */
export {
  buildSearchVectorSql,
  deleteSearchDocument,
  normalizeSearchLabels,
  normalizeSearchText,
  reindexSearchDocuments,
  resolveSearchDocumentPayload,
  syncSearchDocumentsForCard,
  syncSearchDocumentsForScope,
  upsertSearchDocument,
  type ReindexSearchDocumentsInput,
  type ReindexSearchDocumentsResult,
  type ResolvedSearchDocument,
  type SearchDocumentRef,
  type SearchIndexerDb,
} from '@pusula/db/search-indexer';
