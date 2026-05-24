/**
 * Faz 13P (DEM-272) — `report-retention` unit tests.
 *
 * Pure surface (`isObjectMissingError` + sabitler + `processReportRetentionTick`
 * pipeline davranışı) callable-stub DB ile test edilir. Integration suite
 * (gerçek Postgres + asset/render satırları) ayrı dosyada: `report-
 * retention.integration.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@pusula/db';
import { reportRenders, reportRenderAssets } from '@pusula/db';
import {
  MAX_AD_HOC_PER_TICK,
  MAX_SAVED_PER_TICK,
  REPORT_RETENTION_TICK_CRON,
  REPORT_RETENTION_TICK_JOB_NAME,
  isObjectMissingError,
  processReportRetentionTick,
  type ReportRetentionStorage,
  type ReportRetentionTickDeps,
} from './report-retention';

// drizzle-orm `eq(col, val)` mock — col reference yerine sadece value taşır.
// Hem `_id` hem `_renderId` set'ler; fake DB hangisini okuyacağını chain
// içeriğinden anlar.
vi.mock('@pusula/db', async () => {
  const actual = await vi.importActual<typeof DbModule>('@pusula/db');
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({
      _id: value as string,
      _renderId: value as string,
    }),
    and: (...args: unknown[]) => args[0],
    isNotNull: () => ({ kind: 'isNotNull' }),
    isNull: () => ({ kind: 'isNull' }),
    lt: () => ({ kind: 'lt' }),
    asc: () => ({ kind: 'asc' }),
  };
});

// ─── Sabit assertions ──────────────────────────────────────────────────────

describe('report-retention sabitleri', () => {
  it('daily cron 03:00 UTC', () => {
    expect(REPORT_RETENTION_TICK_CRON).toBe('0 3 * * *');
    expect(REPORT_RETENTION_TICK_JOB_NAME).toBe('report-retention-tick');
  });

  it('per-tick limit savunma sınırları', () => {
    expect(MAX_SAVED_PER_TICK).toBeGreaterThanOrEqual(100);
    expect(MAX_AD_HOC_PER_TICK).toBeGreaterThanOrEqual(100);
  });
});

// ─── isObjectMissingError ──────────────────────────────────────────────────

describe('isObjectMissingError', () => {
  it('NoSuchKey error name → true', () => {
    expect(isObjectMissingError({ name: 'NoSuchKey' })).toBe(true);
  });
  it('NotFound error name → true', () => {
    expect(isObjectMissingError({ name: 'NotFound' })).toBe(true);
  });
  it('Code NoSuchKey → true', () => {
    expect(isObjectMissingError({ Code: 'NoSuchKey' })).toBe(true);
  });
  it('404 status → true', () => {
    expect(isObjectMissingError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });
  it('500 status → false', () => {
    expect(isObjectMissingError({ $metadata: { httpStatusCode: 500 } })).toBe(false);
  });
  it('null/undefined → false', () => {
    expect(isObjectMissingError(null)).toBe(false);
    expect(isObjectMissingError(undefined)).toBe(false);
    expect(isObjectMissingError('not an object')).toBe(false);
  });
});

// ─── Mock DB ──────────────────────────────────────────────────────────────
//
// processReportRetentionTick'in DB çağrı sırası:
//   1. select({savedReportId}).from(reportRenders).where(...).groupBy(...).limit(N)
//   2. (her aday için) select({id,version,createdAt}).from(...).where(eq(savedReportId,X))
//      → no limit, no orderBy → chain await-resolved
//   3. (her delete decision için)
//      a. select(no cols).from(reportRenderAssets).where(eq(renderId,X))
//      b. transaction:
//         - delete(reportRenderAssets).where(eq(renderId,X))
//         - delete(reportRenders).where(eq(id,X))
//   4. select({id,createdAt}).from(reportRenders).where(...).orderBy(...).limit(N)
//   5. (her ad-hoc delete için) — adım 3 ile aynı.
//
// Chain.where, eq mock'undan gelen `_renderId` veya `_id`'yi yakalar; chain
// final await'de (`.limit(n)` veya tail `.then`) doğru data dönüşü için
// kullanılır.

interface RenderRow {
  id: string;
  savedReportId: string | null;
  version: number;
  createdAt: Date;
}

interface AssetRow {
  id: string;
  renderId: string;
  s3Bucket: string;
  s3Key: string;
}

function fakeDb(initial: { renders?: RenderRow[]; assets?: AssetRow[] } = {}) {
  const renders = new Map<string, RenderRow>();
  const assets = new Map<string, AssetRow[]>();
  for (const r of initial.renders ?? []) renders.set(r.id, r);
  for (const a of initial.assets ?? []) {
    const arr = assets.get(a.renderId) ?? [];
    arr.push(a);
    assets.set(a.renderId, arr);
  }

  function makeSelectChain(cols: unknown) {
    type SelectVariant =
      | 'savedReportIdOnly'
      | 'versionRows'
      | 'idAndCreatedAt'
      | 'assetsFull';
    let variant: SelectVariant = 'assetsFull';
    if (cols && typeof cols === 'object') {
      const colObj = cols as Record<string, unknown>;
      const keys = Object.keys(colObj);
      if (keys.length === 1 && keys[0] === 'savedReportId') {
        variant = 'savedReportIdOnly';
      } else if (keys.includes('version')) {
        variant = 'versionRows';
      } else if (keys.includes('id') && keys.includes('createdAt')) {
        variant = 'idAndCreatedAt';
      }
    }
    let renderIdFilter: string | null = null;
    const resolve = (): unknown[] => {
      if (variant === 'savedReportIdOnly') {
        const distinct = Array.from(
          new Set(
            Array.from(renders.values())
              .filter((r) => r.savedReportId !== null)
              .map((r) => r.savedReportId as string),
          ),
        );
        return distinct.map((id) => ({ savedReportId: id }));
      }
      if (variant === 'versionRows') {
        // Where filtresinden gelen savedReportId
        const savedId = renderIdFilter;
        const rows = Array.from(renders.values()).filter(
          (r) => r.savedReportId === savedId,
        );
        return rows.map((r) => ({
          id: r.id,
          version: r.version,
          createdAt: r.createdAt,
        }));
      }
      if (variant === 'idAndCreatedAt') {
        // Ad-hoc candidates: savedReportId IS NULL filter
        const adHoc = Array.from(renders.values()).filter(
          (r) => r.savedReportId === null,
        );
        return adHoc.map((r) => ({ id: r.id, createdAt: r.createdAt }));
      }
      // assetsFull: renderIdFilter ile filtrele
      if (renderIdFilter !== null) {
        return assets.get(renderIdFilter) ?? [];
      }
      return [];
    };

    const chain: {
      from: (t: unknown) => typeof chain;
      where: (w: unknown) => typeof chain;
      groupBy: (g: unknown) => typeof chain;
      orderBy: (o: unknown) => typeof chain;
      limit: (n: number) => Promise<unknown[]>;
      then: (onF?: (v: unknown[]) => unknown) => Promise<unknown>;
    } = {
      from: () => chain,
      where(w: unknown) {
        const f = w as { _id?: string; _renderId?: string } | undefined;
        if (f && typeof f === 'object') {
          if (variant === 'versionRows' || variant === 'assetsFull') {
            renderIdFilter = f._renderId ?? f._id ?? null;
          }
        }
        return chain;
      },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(resolve()),
      then(onFulfilled) {
        return Promise.resolve(resolve()).then(onFulfilled);
      },
    };
    return chain;
  }

  function makeDeleteChain(table: unknown) {
    return {
      where(w: unknown) {
        const f = w as { _id?: string; _renderId?: string };
        // Mock `eq` her zaman hem `_id` hem `_renderId` taşır; table reference
        // identity check ile hangi tabloyu sileceğimize karar veririz.
        if (table === reportRenderAssets && f._renderId) {
          assets.delete(f._renderId);
        }
        if (table === reportRenders && f._id) {
          renders.delete(f._id);
        }
        return Promise.resolve();
      },
    };
  }

  // Tablo referansları top-level import'tan gelir — vi.mock `vi.importActual`
  // ile gerçek `reportRenders`/`reportRenderAssets`'ı korur.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    select(cols?: unknown) {
      return makeSelectChain(cols);
    },
    delete(table: unknown) {
      return makeDeleteChain(table);
    },
    async transaction<T>(cb: (tx: typeof db) => Promise<T>) {
      return cb(db);
    },
    _state: { renders, assets },
  };
  return db;
}

function fakeStorage(opts: { failKeys?: Set<string>; missingKeys?: Set<string> } = {}) {
  const calls: Array<{ bucket: string; key: string }> = [];
  const storage: ReportRetentionStorage = {
    async deleteObject(input) {
      calls.push(input);
      if (opts.missingKeys?.has(input.key)) {
        throw Object.assign(new Error('NoSuchKey'), {
          name: 'NoSuchKey',
          $metadata: { httpStatusCode: 404 },
        });
      }
      if (opts.failKeys?.has(input.key)) {
        throw Object.assign(new Error('S3 5xx'), {
          name: 'ServiceUnavailable',
          $metadata: { httpStatusCode: 503 },
        });
      }
    },
  };
  return { storage, calls };
}

const NOW = new Date('2026-05-24T12:00:00.000Z');
const ONE_DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() - n * ONE_DAY);

function makeDeps(overrides: Partial<ReportRetentionTickDeps> = {}): ReportRetentionTickDeps {
  const { storage } = fakeStorage();
  return {
    db: fakeDb() as unknown as ReportRetentionTickDeps['db'],
    storage,
    dryRun: false,
    now: () => NOW,
    ...overrides,
  };
}

describe('processReportRetentionTick (unit)', () => {
  it('boş DB → counter sıfır', async () => {
    const db = fakeDb();
    const result = await processReportRetentionTick(
      makeDeps({ db: db as unknown as ReportRetentionTickDeps['db'] }),
    );
    expect(result.evaluated).toBe(0);
    expect(result.kept).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.dryRun).toBe(false);
  });

  it('dry-run modu hiçbir şey silmez ama deleted sayar', async () => {
    const renders: RenderRow[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      savedReportId: 'sr-1',
      version: i + 1,
      createdAt: days(200),
    }));
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'r1', s3Bucket: 'pusula-reports', s3Key: 'workspace/w1/r1.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage, calls } = fakeStorage();
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
        dryRun: true,
      }),
    );
    expect(result.deleted).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(calls).toHaveLength(0);
    expect(db._state.renders.size).toBe(6);
  });

  it('saved + 6 versiyon → 1 silinir + S3 obje silinir + asset+render satırı kalkar', async () => {
    const renders: RenderRow[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      savedReportId: 'sr-1',
      version: i + 1,
      createdAt: days(200),
    }));
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'r1', s3Bucket: 'pusula-reports', s3Key: 'workspace/w1/r1.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage, calls } = fakeStorage();
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
      }),
    );
    expect(result.deleted).toBe(1);
    expect(result.kept).toBe(5);
    expect(result.failed).toBe(0);
    expect(calls).toEqual([
      { bucket: 'pusula-reports', key: 'workspace/w1/r1.pdf' },
    ]);
    expect(db._state.renders.has('r1')).toBe(false);
    expect(db._state.renders.has('r6')).toBe(true);
    expect(db._state.assets.has('r1')).toBe(false);
  });

  it('ad-hoc 95g eski render → silinir', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'workspace/w1/adh-1.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage, calls } = fakeStorage();
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
      }),
    );
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(0);
    expect(calls).toEqual([
      { bucket: 'pusula-reports', key: 'workspace/w1/adh-1.pdf' },
    ]);
    expect(db._state.renders.has('adh-1')).toBe(false);
  });

  it('S3 delete fail (5xx) → render silinmez, failed +1, Sentry capture', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'broken-key.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage } = fakeStorage({ failKeys: new Set(['broken-key.pdf']) });
    const captureException = vi.fn();
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
        captureException,
      }),
    );
    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(0);
    expect(db._state.renders.has('adh-1')).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(ctx).toMatchObject({
      renderId: 'adh-1',
      stage: 'storage_delete',
      reason: 'ad_hoc_expired',
    });
  });

  it('S3 404 (NoSuchKey) tolere edilir → DB silinir, failed sayılmaz', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'ghost.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage } = fakeStorage({ missingKeys: new Set(['ghost.pdf']) });
    const captureException = vi.fn();
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
        captureException,
      }),
    );
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(0);
    expect(db._state.renders.has('adh-1')).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captureException undefined → Sentrysiz çalışır, fail throw etmez', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'broken.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage } = fakeStorage({ failKeys: new Set(['broken.pdf']) });
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
        captureException: undefined,
      }),
    );
    expect(result.failed).toBe(1);
  });

  it('captureException kendisi throw ederse tick fail etmez', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'broken.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const { storage } = fakeStorage({ failKeys: new Set(['broken.pdf']) });
    const captureException = vi.fn(() => {
      throw new Error('sentry sdk crashed');
    });
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        storage,
        captureException,
      }),
    );
    expect(result.failed).toBe(1);
  });

  it('maxAgeDays override (=7) ile 10g eski ad-hoc silinir', async () => {
    const renders: RenderRow[] = [
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(10) },
    ];
    const assets: AssetRow[] = [
      { id: 'a1', renderId: 'adh-1', s3Bucket: 'pusula-reports', s3Key: 'k.pdf' },
    ];
    const db = fakeDb({ renders, assets });
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        maxAgeDays: 7,
      }),
    );
    expect(result.deleted).toBe(1);
  });

  it('keepVersions=10 override — 6 saved versiyonu hepsi 200g eski → hepsi kalır', async () => {
    const renders: RenderRow[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      savedReportId: 'sr-1',
      version: i + 1,
      createdAt: days(200),
    }));
    const db = fakeDb({ renders });
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
        keepVersions: 10,
      }),
    );
    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(6);
  });

  it('birden çok saved + ad-hoc karışık → her grup ayrı değerlendirilir', async () => {
    const renders: RenderRow[] = [
      // sr-1: 6 versiyon, hepsi eski → 1 sil
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `sr1-r${i + 1}`,
        savedReportId: 'sr-1',
        version: i + 1,
        createdAt: days(200),
      })),
      // sr-2: 3 versiyon, hepsi eski → 0 sil (3 < 5)
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `sr2-r${i + 1}`,
        savedReportId: 'sr-2',
        version: i + 1,
        createdAt: days(150),
      })),
      // 2 ad-hoc eski → 2 sil
      { id: 'adh-1', savedReportId: null, version: 1, createdAt: days(95) },
      { id: 'adh-2', savedReportId: null, version: 1, createdAt: days(120) },
    ];
    const db = fakeDb({ renders });
    const result = await processReportRetentionTick(
      makeDeps({
        db: db as unknown as ReportRetentionTickDeps['db'],
      }),
    );
    expect(result.deleted).toBe(3);
    expect(result.savedScanned).toBe(2);
    expect(result.adHocScanned).toBe(2);
  });
});
