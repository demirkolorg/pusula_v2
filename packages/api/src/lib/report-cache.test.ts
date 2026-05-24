import { describe, expect, it } from 'vitest';
import {
  REPORT_CACHE_TTL_SECONDS,
  buildReportCacheKey,
  buildRedisReportCache,
  noOpReportCache,
  NoOpReportCache,
  reportInvalidationPattern,
  type ReportCache,
} from './report-cache';

const FILTERS_A = { range: { kind: 'preset' as const, preset: 'last30d' as const } };
const FILTERS_B = { range: { kind: 'preset' as const, preset: 'last7d' as const } };
const SCOPE_BOARD = {
  kind: 'board' as const,
  boardId: 'b-1',
  workspaceId: 'w-1',
};
const SCOPE_CARD = {
  kind: 'card' as const,
  cardId: 'c-1',
  boardId: 'b-1',
  workspaceId: 'w-1',
};
const SCOPE_WORKSPACE = { kind: 'workspace' as const, workspaceId: 'w-1' };

describe('REPORT_CACHE_TTL_SECONDS', () => {
  it('matches §16.7 table', () => {
    expect(REPORT_CACHE_TTL_SECONDS.card).toBe(60);
    expect(REPORT_CACHE_TTL_SECONDS.list).toBe(90);
    expect(REPORT_CACHE_TTL_SECONDS.board).toBe(180);
    expect(REPORT_CACHE_TTL_SECONDS.workspace).toBe(300);
    expect(REPORT_CACHE_TTL_SECONDS.pdfDataset).toBe(600);
  });
});

describe('buildReportCacheKey', () => {
  const baseArgs = {
    scope: SCOPE_BOARD,
    presetId: 'board.health',
    filters: FILTERS_A,
    comparison: null,
    userId: 'u-1',
  };

  it('emits the documented `report:dataset:v1` prefix + scopeKind + scopeId', () => {
    const key = buildReportCacheKey(baseArgs);
    expect(key).toMatch(/^report:dataset:v1:board:b-1:board\.health:[0-9a-f]{16}$/);
  });

  it('uses scope.cardId for card scope', () => {
    const key = buildReportCacheKey({ ...baseArgs, scope: SCOPE_CARD });
    expect(key).toContain(':card:c-1:');
  });

  it('uses scope.workspaceId for workspace scope', () => {
    const key = buildReportCacheKey({ ...baseArgs, scope: SCOPE_WORKSPACE });
    expect(key).toContain(':workspace:w-1:');
  });

  it('produces a stable hash for the same input', () => {
    const a = buildReportCacheKey(baseArgs);
    const b = buildReportCacheKey(baseArgs);
    expect(a).toBe(b);
  });

  it('changes hash when filters change', () => {
    const a = buildReportCacheKey(baseArgs);
    const b = buildReportCacheKey({ ...baseArgs, filters: FILTERS_B });
    expect(a).not.toBe(b);
  });

  it('changes hash when comparison toggles', () => {
    const a = buildReportCacheKey(baseArgs);
    const b = buildReportCacheKey({
      ...baseArgs,
      comparison: { enabled: true, mode: 'previousPeriod' },
    });
    expect(a).not.toBe(b);
  });

  it('changes hash when userId differs (permission filtering)', () => {
    const a = buildReportCacheKey(baseArgs);
    const b = buildReportCacheKey({ ...baseArgs, userId: 'u-2' });
    expect(a).not.toBe(b);
  });

  it('isAdmin=true appends `:admin` suffix + drops userId from hash', () => {
    const adminA = buildReportCacheKey({ ...baseArgs, isAdmin: true });
    const adminB = buildReportCacheKey({ ...baseArgs, userId: 'u-different', isAdmin: true });
    expect(adminA).toMatch(/:admin$/);
    expect(adminA).toBe(adminB); // userId hash'ten düştü
  });

  it('admin and non-admin keys are distinct', () => {
    const a = buildReportCacheKey(baseArgs);
    const b = buildReportCacheKey({ ...baseArgs, isAdmin: true });
    expect(a).not.toBe(b);
  });
});

describe('reportInvalidationPattern', () => {
  it('emits glob pattern with scopeKind + scopeId prefix + wildcard', () => {
    expect(reportInvalidationPattern({ scopeKind: 'board', scopeId: 'b-9' })).toBe(
      'report:dataset:v1:board:b-9:*',
    );
    expect(reportInvalidationPattern({ scopeKind: 'workspace', scopeId: 'w-1' })).toBe(
      'report:dataset:v1:workspace:w-1:*',
    );
  });

  it('rejects unsafe scopeId with `:` (segment injection — DEM-261 HIGH-1)', () => {
    expect(() =>
      reportInvalidationPattern({ scopeKind: 'board', scopeId: 'b-1:malicious' }),
    ).toThrowError(/unsafe key segment/);
  });

  it('rejects unsafe scopeId with `*` Redis glob meta char', () => {
    expect(() =>
      reportInvalidationPattern({ scopeKind: 'board', scopeId: 'b-1*' }),
    ).toThrowError(/unsafe key segment/);
  });

  it('rejects empty scopeId', () => {
    expect(() => reportInvalidationPattern({ scopeKind: 'board', scopeId: '' })).toThrowError(
      /unsafe key segment/,
    );
  });
});

describe('buildReportCacheKey segment safety (DEM-261 HIGH-1)', () => {
  const baseArgs = {
    scope: SCOPE_BOARD,
    presetId: 'board.health',
    filters: FILTERS_A,
    comparison: null,
    userId: 'u-1',
  };

  it('rejects scopeId with `:` injection', () => {
    expect(() =>
      buildReportCacheKey({
        ...baseArgs,
        scope: { ...SCOPE_BOARD, boardId: 'b-1:victim:other:preset' },
      }),
    ).toThrowError(/unsafe key segment/);
  });

  it('rejects presetId with `:` injection', () => {
    expect(() =>
      buildReportCacheKey({ ...baseArgs, presetId: 'board.health:malicious' }),
    ).toThrowError(/unsafe key segment/);
  });

  it('rejects scopeId with glob `*` wildcard', () => {
    expect(() =>
      buildReportCacheKey({ ...baseArgs, scope: { ...SCOPE_BOARD, boardId: '*' } }),
    ).toThrowError(/unsafe key segment/);
  });

  it('rejects scopeId longer than 64 chars', () => {
    expect(() =>
      buildReportCacheKey({
        ...baseArgs,
        scope: { ...SCOPE_BOARD, boardId: 'a'.repeat(65) },
      }),
    ).toThrowError(/unsafe key segment/);
  });

  it('accepts dotted preset id (board.health, card.due-and-aging) ✓', () => {
    expect(() =>
      buildReportCacheKey({ ...baseArgs, presetId: 'card.due-and-aging' }),
    ).not.toThrow();
  });
});

describe('NoOpReportCache', () => {
  const cache: ReportCache = new NoOpReportCache();
  it('get always null', async () => {
    expect(await cache.get('any')).toBeNull();
  });
  it('set is a no-op', async () => {
    await expect(cache.set('k', { x: 1 }, 60)).resolves.toBeUndefined();
  });
  it('invalidatePattern returns 0', async () => {
    expect(await cache.invalidatePattern('report:*')).toBe(0);
  });
  it('singleton noOpReportCache is reachable', async () => {
    expect(await noOpReportCache.get('x')).toBeNull();
  });
});

// ─── Redis impl (in-memory fake) ────────────────────────────────────────────

/**
 * Minimal ioredis-shape fake — Pusula testlerinde testcontainers Redis
 * yerine bağımsız çalışan deterministik impl. SET + GET + DEL + SCAN
 * (cursor='0' tek tur).
 */
function createFakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  return {
    store,
    async get(key: string): Promise<string | null> {
      const row = store.get(key);
      if (!row) return null;
      if (row.expiresAt !== null && Date.now() > row.expiresAt) {
        store.delete(key);
        return null;
      }
      return row.value;
    },
    async set(key: string, value: string, _ex: 'EX', ttl: number): Promise<'OK'> {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    },
    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
      }
      return n;
    },
    async scan(
      cursor: string,
      _match: 'MATCH',
      pattern: string,
      _count: 'COUNT',
      _n: number,
    ): Promise<[string, string[]]> {
      // Tek-tur scan (fake için yeterli): tüm key'leri pattern ile filtrele.
      if (cursor !== '0') return ['0', []];
      const regex = new RegExp(
        '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      const matched = Array.from(store.keys()).filter((k) => regex.test(k));
      return ['0', matched];
    },
  };
}

describe('buildRedisReportCache', () => {
  it('set/get round-trip stores JSON', async () => {
    const redis = createFakeRedis();
    const cache = buildRedisReportCache(redis);
    await cache.set('k1', { x: 1, y: 'a' }, 60);
    expect(await cache.get<{ x: number; y: string }>('k1')).toEqual({ x: 1, y: 'a' });
  });

  it('get returns null for missing key', async () => {
    const cache = buildRedisReportCache(createFakeRedis());
    expect(await cache.get('does-not-exist')).toBeNull();
  });

  it('get self-heals corrupted JSON (DEL + null)', async () => {
    const redis = createFakeRedis();
    redis.store.set('bad', { value: '{not-json', expiresAt: null });
    const cache = buildRedisReportCache(redis);
    expect(await cache.get('bad')).toBeNull();
    expect(redis.store.has('bad')).toBe(false);
  });

  it('invalidatePattern SCAN+DEL matches glob, returns count', async () => {
    const redis = createFakeRedis();
    const cache = buildRedisReportCache(redis);
    await cache.set('report:dataset:v1:board:b-1:preset1:hash1', { v: 1 }, 60);
    await cache.set('report:dataset:v1:board:b-1:preset2:hash2', { v: 2 }, 60);
    await cache.set('report:dataset:v1:board:b-9:other:hash3', { v: 3 }, 60);
    const deleted = await cache.invalidatePattern('report:dataset:v1:board:b-1:*');
    expect(deleted).toBe(2);
    expect(redis.store.has('report:dataset:v1:board:b-1:preset1:hash1')).toBe(false);
    expect(redis.store.has('report:dataset:v1:board:b-9:other:hash3')).toBe(true);
  });

  it('invalidatePattern returns 0 when nothing matches', async () => {
    const cache = buildRedisReportCache(createFakeRedis());
    expect(await cache.invalidatePattern('report:dataset:v1:board:b-1:*')).toBe(0);
  });

  it('set respects EX ttl (expiry windowing)', async () => {
    const redis = createFakeRedis();
    const cache = buildRedisReportCache(redis);
    await cache.set('k', 'v', 1);
    const row = redis.store.get('k');
    expect(row?.expiresAt).toBeGreaterThan(Date.now());
    expect(row?.expiresAt).toBeLessThanOrEqual(Date.now() + 1500);
  });
});
