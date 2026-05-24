import { describe, expect, it, vi } from 'vitest';
import { REPORT_INVALIDATED_CHANNEL } from '@pusula/api/lib/report-invalidation';
import {
  processReportCacheInvalidatorJob,
  type ReportCacheInvalidatorJobData,
} from './report-cache-invalidator';

/**
 * In-memory Redis fake (cache.test.ts ile aynı pattern — bağımsız ioredis
 * mock, deterministik SCAN+DEL).
 */
function createFakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  return {
    store,
    async get(key: string): Promise<string | null> {
      const row = store.get(key);
      return row?.value ?? null;
    },
    async set(key: string, value: string, _ex: 'EX', ttl: number): Promise<'OK'> {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    },
    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    },
    async scan(
      cursor: string,
      _match: 'MATCH',
      pattern: string,
      _count: 'COUNT',
      _n: number,
    ): Promise<[string, string[]]> {
      if (cursor !== '0') return ['0', []];
      const regex = new RegExp(
        '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      const matched = Array.from(store.keys()).filter((k) => regex.test(k));
      return ['0', matched];
    },
  };
}

function createFakePublisher() {
  const calls: Array<{ channel: string; message: string }> = [];
  return {
    calls,
    publish: vi.fn(async (channel: string, message: string): Promise<number> => {
      calls.push({ channel, message });
      return 1;
    }),
  };
}

const FIXED_NOW = new Date('2026-05-24T12:00:00.000Z');

describe('processReportCacheInvalidatorJob', () => {
  it('card.moved → 4 pattern scan + workspace+board+list+card key sayar', async () => {
    const redis = createFakeRedis();
    redis.store.set('report:dataset:v1:workspace:w-1:p:h', { value: '{}', expiresAt: null });
    redis.store.set('report:dataset:v1:board:b-1:p:h', { value: '{}', expiresAt: null });
    redis.store.set('report:dataset:v1:list:l-1:p:h', { value: '{}', expiresAt: null });
    redis.store.set('report:dataset:v1:card:c-1:p:h', { value: '{}', expiresAt: null });
    // Eşleşmeyen — silinmemeli.
    redis.store.set('report:dataset:v1:workspace:w-other:p:h', { value: '{}', expiresAt: null });

    const publisher = createFakePublisher();
    const data: ReportCacheInvalidatorJobData = {
      event: {
        eventType: 'card.moved',
        workspaceId: 'w-1',
        boardId: 'b-1',
        listId: 'l-1',
        cardId: 'c-1',
      },
    };
    const result = await processReportCacheInvalidatorJob(data, {
      redis,
      publisher,
      now: () => FIXED_NOW,
    });
    expect(result.patternsScanned).toBe(4);
    expect(result.totalKeysDeleted).toBe(4);
    expect(redis.store.has('report:dataset:v1:workspace:w-other:p:h')).toBe(true);
  });

  it('socket publish: workspace room + scopeKinds payload', async () => {
    const redis = createFakeRedis();
    const publisher = createFakePublisher();
    await processReportCacheInvalidatorJob(
      {
        event: {
          eventType: 'card.created',
          workspaceId: 'w-1',
          boardId: 'b-1',
          listId: 'l-1',
          cardId: 'c-1',
        },
      },
      { redis, publisher, now: () => FIXED_NOW },
    );
    expect(publisher.calls.length).toBe(1);
    const call = publisher.calls[0]!;
    expect(call.channel).toBe(REPORT_INVALIDATED_CHANNEL);
    const payload = JSON.parse(call.message);
    expect(payload.room).toEqual({ kind: 'workspace', id: 'w-1' });
    expect(payload.event.eventType).toBe('card.created');
    expect(payload.event.workspaceId).toBe('w-1');
    expect(payload.event.scopeKinds).toEqual(['workspace', 'board', 'list', 'card']);
    expect(payload.event.at).toBe(FIXED_NOW.toISOString());
  });

  it('cross-board card.movedToList → both boards invalidated', async () => {
    const redis = createFakeRedis();
    redis.store.set('report:dataset:v1:board:b-target:p:h', { value: '{}', expiresAt: null });
    redis.store.set('report:dataset:v1:board:b-source:p:h', { value: '{}', expiresAt: null });
    const publisher = createFakePublisher();
    const result = await processReportCacheInvalidatorJob(
      {
        event: {
          eventType: 'card.movedToList',
          workspaceId: 'w-1',
          boardId: 'b-target',
          fromBoardId: 'b-source',
          listId: 'l-1',
          cardId: 'c-1',
        },
      },
      { redis, publisher, now: () => FIXED_NOW },
    );
    expect(redis.store.has('report:dataset:v1:board:b-target:p:h')).toBe(false);
    expect(redis.store.has('report:dataset:v1:board:b-source:p:h')).toBe(false);
    expect(result.totalKeysDeleted).toBe(2);
  });

  it('cache miss (key yok) → scan 0 döner, socket yine publish edilir', async () => {
    const redis = createFakeRedis(); // boş store
    const publisher = createFakePublisher();
    const result = await processReportCacheInvalidatorJob(
      {
        event: {
          eventType: 'comment.created',
          workspaceId: 'w-1',
          boardId: 'b-1',
          cardId: 'c-1',
        },
      },
      { redis, publisher, now: () => FIXED_NOW },
    );
    expect(result.totalKeysDeleted).toBe(0);
    expect(result.socketPublished).toBe(true);
  });

  it('socket publish hatası cache invalidation\'ı geçersiz kılmaz', async () => {
    const redis = createFakeRedis();
    redis.store.set('report:dataset:v1:workspace:w-1:p:h', { value: '{}', expiresAt: null });
    const publisher = {
      publish: vi.fn(async () => {
        throw new Error('redis pub/sub blip');
      }),
    };
    const result = await processReportCacheInvalidatorJob(
      {
        event: { eventType: 'workspace.member.added', workspaceId: 'w-1' },
      },
      { redis, publisher, now: () => FIXED_NOW },
    );
    expect(result.totalKeysDeleted).toBe(1);
    expect(result.socketPublished).toBe(false);
  });

  it('SCAN hatası tek pattern\'ı atlar, diğerleri devam eder', async () => {
    const redis = createFakeRedis();
    redis.store.set('report:dataset:v1:workspace:w-1:p:h', { value: '{}', expiresAt: null });
    redis.store.set('report:dataset:v1:board:b-1:p:h', { value: '{}', expiresAt: null });
    // İlk SCAN çağrısında fail; sonraki çağrılar normal devam etmeli.
    let scanCallNo = 0;
    redis.scan = (async (
      cursor: string,
      _match: 'MATCH',
      pattern: string,
      _count: 'COUNT',
      _n: number,
    ) => {
      scanCallNo++;
      if (scanCallNo === 1) throw new Error('scan blip');
      if (cursor !== '0') return ['0', []] as [string, string[]];
      const regex = new RegExp(
        '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      return ['0', Array.from(redis.store.keys()).filter((k) => regex.test(k))] as [
        string,
        string[],
      ];
    }) as typeof redis.scan;
    const publisher = createFakePublisher();
    const result = await processReportCacheInvalidatorJob(
      {
        event: {
          eventType: 'card.created',
          workspaceId: 'w-1',
          boardId: 'b-1',
        },
      },
      { redis, publisher, now: () => FIXED_NOW },
    );
    // İlk pattern (workspace) fail; ikinci (board) başarılı → 1 key silinir.
    expect(result.totalKeysDeleted).toBeGreaterThanOrEqual(1);
    expect(result.socketPublished).toBe(true);
  });
});
