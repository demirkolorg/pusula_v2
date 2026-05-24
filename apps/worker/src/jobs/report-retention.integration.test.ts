/**
 * Faz 13P (DEM-272) — `report-retention` integration tests.
 *
 * `attachment-cleanup-sweeper.test.ts` probe pattern'i ile dev/CI Postgres'e
 * bağlanır — DB yoksa suite skip. Gerçek `report_renders` +
 * `report_render_assets` insert/delete üzerinden retention pipeline
 * doğrulanır. Storage mock (S3 SDK çağrılmaz).
 *
 * Bu dosya `@pusula/db` mock ETMEZ — birim test dosyası (`report-
 * retention.test.ts`) drizzle helper'larını mocklarken bu dosya gerçek
 * Drizzle SQL operator'larını kullanır.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boards,
  cards,
  lists,
  reportRenderAssets,
  reportRenders,
  savedReports,
  users,
  workspaces,
} from '@pusula/db';
import {
  processReportRetentionTick,
  type ReportRetentionStorage,
} from './report-retention';

const ONE_DAY = 24 * 60 * 60 * 1000;

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

function recordingStorage(): ReportRetentionStorage & {
  calls: Array<{ bucket: string; key: string }>;
} {
  const calls: Array<{ bucket: string; key: string }> = [];
  return {
    calls,
    async deleteObject(input) {
      calls.push(input);
    },
  };
}

describe.runIf(dbAvailable)('processReportRetentionTick (integration)', () => {
  const db = () => probe!.db;

  const userId = newId('u-rr');
  const workspaceId = newId('ws-rr');
  const boardId = newId('b-rr');
  const listId = newId('l-rr');
  const cardId = newId('c-rr');
  const savedReportId = newId('sr-rr');
  const cleanupRenderIds: string[] = [];

  beforeAll(async () => {
    await db().insert(users).values({
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
    });
    await db().insert(workspaces).values({
      id: workspaceId,
      name: 'RR WS',
      slug: workspaceId,
      ownerId: userId,
    });
    await db().insert(boards).values({ id: boardId, workspaceId, title: 'RR Board' });
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    await db().insert(cards).values({
      id: cardId,
      boardId,
      listId,
      title: 'C',
      position: 'a0',
    });
    await db().insert(savedReports).values({
      id: savedReportId,
      workspaceId,
      scopeKind: 'board',
      scopeId: boardId,
      presetId: 'board.health',
      title: 'Retention test report',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [{ microReportId: 'status-breakdown', enabled: true }],
      createdBy: userId,
    });
  });

  afterAll(async () => {
    if (!probe) return;
    if (cleanupRenderIds.length > 0) {
      await db()
        .delete(reportRenderAssets)
        .where(dbMod.inArray(reportRenderAssets.renderId, cleanupRenderIds));
      await db()
        .delete(reportRenders)
        .where(dbMod.inArray(reportRenders.id, cleanupRenderIds));
    }
    await db().delete(savedReports).where(dbMod.eq(savedReports.id, savedReportId));
    await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    await db().delete(lists).where(dbMod.eq(lists.id, listId));
    await db().delete(boards).where(dbMod.eq(boards.id, boardId));
    await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.eq(users.id, userId));
    await probe.pool.end();
  });

  beforeEach(async () => {
    if (cleanupRenderIds.length > 0) {
      await db()
        .delete(reportRenderAssets)
        .where(dbMod.inArray(reportRenderAssets.renderId, cleanupRenderIds));
      await db()
        .delete(reportRenders)
        .where(dbMod.inArray(reportRenders.id, cleanupRenderIds));
      cleanupRenderIds.length = 0;
    }
  });

  async function seedRender(opts: {
    savedReportId: string | null;
    version: number;
    createdAt: Date;
    withAsset?: boolean;
  }): Promise<string> {
    const id = newId('rr');
    cleanupRenderIds.push(id);
    await db().insert(reportRenders).values({
      id,
      workspaceId,
      savedReportId: opts.savedReportId,
      scopeKind: 'board',
      scopeId: boardId,
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      status: 'completed',
      format: 'pdf',
      version: opts.version,
      triggerKind: 'manual',
      triggeredBy: userId,
      createdAt: opts.createdAt,
      completedAt: opts.createdAt,
    });
    if (opts.withAsset) {
      await db().insert(reportRenderAssets).values({
        renderId: id,
        format: 'pdf',
        s3Bucket: 'pusula-reports',
        s3Key: `workspace/${workspaceId}/${id}.pdf`,
        byteSize: 1024,
      });
    }
    return id;
  }

  it('saved + 6 versiyon (hepsi 180g eski) → son 5 korunur, en eski silinir', async () => {
    const ids: string[] = [];
    for (let v = 1; v <= 6; v += 1) {
      ids.push(
        await seedRender({
          savedReportId,
          version: v,
          createdAt: new Date(Date.now() - 180 * ONE_DAY),
          withAsset: true,
        }),
      );
    }

    const storage = recordingStorage();
    const result = await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: false,
    });

    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const remaining = await db()
      .select({ id: reportRenders.id, version: reportRenders.version })
      .from(reportRenders)
      .where(dbMod.eq(reportRenders.savedReportId, savedReportId))
      .orderBy(dbMod.asc(reportRenders.version));
    expect(remaining.map((r) => r.version)).toEqual([2, 3, 4, 5, 6]);
    expect(remaining.map((r) => r.id)).not.toContain(ids[0]);
    expect(storage.calls).toContainEqual({
      bucket: 'pusula-reports',
      key: `workspace/${workspaceId}/${ids[0]}.pdf`,
    });
    const remainingAssets = await db()
      .select({ id: reportRenderAssets.id })
      .from(reportRenderAssets)
      .where(dbMod.eq(reportRenderAssets.renderId, ids[0]!));
    expect(remainingAssets).toHaveLength(0);
  });

  it('saved + 5 versiyon (hepsi 200g eski) → hepsi tutulur', async () => {
    for (let v = 1; v <= 5; v += 1) {
      await seedRender({
        savedReportId,
        version: v,
        createdAt: new Date(Date.now() - 200 * ONE_DAY),
        withAsset: false,
      });
    }
    const storage = recordingStorage();
    const result = await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: false,
    });
    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(5);
    expect(storage.calls).toHaveLength(0);
  });

  it('ad-hoc 100g eski → silinir; ad-hoc 30g eski → tutulur', async () => {
    const oldId = await seedRender({
      savedReportId: null,
      version: 1,
      createdAt: new Date(Date.now() - 100 * ONE_DAY),
      withAsset: true,
    });
    const freshId = await seedRender({
      savedReportId: null,
      version: 1,
      createdAt: new Date(Date.now() - 30 * ONE_DAY),
      withAsset: true,
    });
    const storage = recordingStorage();
    await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: false,
    });
    const remaining = await db()
      .select({ id: reportRenders.id })
      .from(reportRenders)
      .where(dbMod.inArray(reportRenders.id, [oldId, freshId]));
    const remainingIds = remaining.map((r) => r.id);
    expect(remainingIds).not.toContain(oldId);
    expect(remainingIds).toContain(freshId);
  });

  it('dry-run: hiçbir şey silmez ama sayım doğru', async () => {
    const id = await seedRender({
      savedReportId: null,
      version: 1,
      createdAt: new Date(Date.now() - 100 * ONE_DAY),
      withAsset: true,
    });
    const storage = recordingStorage();
    const result = await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: true,
    });
    expect(result.deleted).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(storage.calls).toHaveLength(0);
    const stillThere = await db()
      .select({ id: reportRenders.id })
      .from(reportRenders)
      .where(dbMod.eq(reportRenders.id, id));
    expect(stillThere).toHaveLength(1);
  });

  it('idempotent: aynı tick iki kez koşunca ikincide silme yok', async () => {
    await seedRender({
      savedReportId: null,
      version: 1,
      createdAt: new Date(Date.now() - 120 * ONE_DAY),
      withAsset: true,
    });
    const storage = recordingStorage();
    const first = await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: false,
    });
    expect(first.deleted).toBeGreaterThanOrEqual(1);
    const firstCallCount = storage.calls.length;
    const second = await processReportRetentionTick({
      db: db(),
      storage,
      dryRun: false,
    });
    expect(second.deleted).toBe(0);
    expect(storage.calls.length).toBe(firstCallCount);
  });
});
