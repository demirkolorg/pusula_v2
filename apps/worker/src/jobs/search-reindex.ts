import type {
  ReindexSearchDocumentsInput,
  ReindexSearchDocumentsResult,
} from '@pusula/db/search-indexer';
import type { Database } from '@pusula/db';
import { reindexSearchDocuments } from '@pusula/db/search-indexer';

export const SEARCH_REINDEX_JOB_NAME = 'search-reindex';

export type SearchReindexJobData = ReindexSearchDocumentsInput;

export function searchReindexJobId(data: SearchReindexJobData): string {
  if (data.boardId) return `search-reindex-board-${data.boardId}`;
  if (data.workspaceId) return `search-reindex-workspace-${data.workspaceId}`;
  return 'search-reindex-all';
}

export async function processSearchReindexJob(
  db: Database,
  data: SearchReindexJobData,
): Promise<ReindexSearchDocumentsResult> {
  return reindexSearchDocuments(db, data);
}
