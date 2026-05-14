import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { boards, searchDocuments, users, workspaces } from '@pusula/db';
import { processSearchReindexJob, SEARCH_REINDEX_JOB_NAME, searchReindexJobId } from './search-reindex';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  await probe.db.execute(dbMod.sql`select card_id, search_vector from search_documents limit 0`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe('search-reindex job metadata', () => {
  it('uses stable job name and scope-based ids', () => {
    expect(SEARCH_REINDEX_JOB_NAME).toBe('search-reindex');
    expect(searchReindexJobId({ boardId: 'board_1' })).toBe('search-reindex-board-board_1');
    expect(searchReindexJobId({ workspaceId: 'workspace_1' })).toBe('search-reindex-workspace-workspace_1');
  });
});

describe.runIf(dbAvailable)('processSearchReindexJob (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
    await probe?.pool.end();
  });

  it('rebuilds search documents for a board scope', async () => {
    const ownerId = newId('u-search-worker');
    createdUserIds.push(ownerId);
    await db().insert(users).values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });
    const [ws] = await db()
      .insert(workspaces)
      .values({ name: 'Worker Search Co', slug: newId('worker-search-co'), ownerId })
      .returning({ id: workspaces.id });
    createdWorkspaceIds.push(ws!.id);
    const [board] = await db()
      .insert(boards)
      .values({ workspaceId: ws!.id, title: 'Worker Board' })
      .returning({ id: boards.id });

    const result = await processSearchReindexJob(db(), { boardId: board!.id });
    const rows = await db()
      .select({ id: searchDocuments.id })
      .from(searchDocuments)
      .where(dbMod.eq(searchDocuments.boardId, board!.id));

    expect(result.upserted).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
