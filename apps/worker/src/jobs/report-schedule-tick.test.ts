/**
 * Faz 13J (DEM-266) — schedule cron tick worker testleri.
 *
 * Drizzle DB için fake builder + fake `enqueueReportRender`. Due schedule
 * scan + render insert + nextRunAt update + enqueue + fail isolation
 * davranışlarını doğrular.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReportSchedule } from '@pusula/db';
import { processReportScheduleTick } from './report-schedule-tick';

// ─── Fake DB builder ──────────────────────────────────────────────────────

interface FakeSchedule extends Partial<ReportSchedule> {
  id: string;
  savedReportId: string;
  isActive: boolean;
  nextRunAt: Date;
  cadence: 'daily' | 'weekly' | 'monthly';
  cadenceConfig: { cadence: 'daily'; hour: number; minute: number };
  timezone: string;
}

interface FakeSaved {
  id: string;
  workspaceId: string;
  scopeKind: 'card' | 'list' | 'board' | 'workspace';
  scopeId: string;
  presetId: string;
  filters: unknown;
  comparison: unknown;
}

interface FakeDbState {
  dueSchedules: FakeSchedule[];
  savedReports: Map<string, FakeSaved>;
  /** Side effects — testle assert için. */
  inserts: Array<{ scheduleId: string | null; savedReportId: string }>;
  updates: Array<{ scheduleId: string; isActive?: boolean; nextRunAt?: Date }>;
}

function makeSchedule(overrides: Partial<FakeSchedule> = {}): FakeSchedule {
  return {
    id: 'sch-1',
    savedReportId: 'sr-1',
    cadence: 'daily',
    cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
    timezone: 'Europe/Istanbul',
    recipientUserIds: [],
    recipientEmails: [],
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-05-24T05:00:00Z'), // due
    createdBy: 'u-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FakeSchedule;
}

function makeSaved(overrides: Partial<FakeSaved> = {}): FakeSaved {
  return {
    id: 'sr-1',
    workspaceId: 'ws-1',
    scopeKind: 'board',
    scopeId: 'b-1',
    presetId: 'board.health',
    filters: { range: { kind: 'preset', preset: 'last30d' } },
    comparison: null,
    ...overrides,
  };
}

function fakeDb(state: FakeDbState): {
  db: Parameters<typeof processReportScheduleTick>[0]['db'];
} {
  // Drizzle `.select().from(t).where(...).orderBy(...).limit(N)` taklit.
  // Hangi tablo'dan SELECT yapıldığını track et: 1. tick scan
  // (reportSchedules), tx içinde 2. saved lookup, 3. version lookup, 4.
  // insert (returning), 5. schedule update.
  let selectFromCounter = 0;
  const insertReturning = (values: { savedReportId: string; scheduleId: string }) => {
    state.inserts.push({
      scheduleId: values.scheduleId,
      savedReportId: values.savedReportId,
    });
    return Promise.resolve([{ id: `r-new-${state.inserts.length}` }]);
  };

  // Self-referential type ihtiyacı (transaction callback `tx === txDb`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txDb: any = {
    select: (cols?: unknown) => {
      selectFromCounter += 1;
      const callNo = selectFromCounter;
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: (_n: number) => {
          // Counter tx içinde reset edilmediği için her select benzersiz.
          // İlk tick select (DB ROOT): due schedules
          if (callNo === 1) return Promise.resolve(state.dueSchedules);
          // Tx içinde: 2. saved lookup, 3. version lookup
          // İçinde hangisi olduğu cols arg'ından anlaşılabilir; basitleştirme:
          // - 2., 4., 6., … select'ler saved lookup
          // - 3., 5., 7., … version lookup
          // Tek schedule için tx içinde 2 select: saved + version
          // 2 schedule için 4 select; v.s.
          // Cols undefined ise saved (tüm satır); cols.version varsa version.
          if (cols && typeof cols === 'object' && 'version' in (cols as Record<string, unknown>)) {
            return Promise.resolve([]); // no prior version
          }
          // Saved lookup
          const savedRows = state.dueSchedules
            .map((s) => state.savedReports.get(s.savedReportId))
            .filter((s): s is FakeSaved => Boolean(s));
          return Promise.resolve(savedRows.length > 0 ? [savedRows[0]] : []);
        },
      };
      return chain;
    },
    insert: () => ({
      values: (values: { savedReportId: string; scheduleId: string }) => ({
        returning: () => insertReturning(values),
      }),
    }),
    update: () => ({
      set: (values: { isActive?: boolean; nextRunAt?: Date }) => ({
        where: () => {
          // schedule id'yi where'den çıkarmak fake için karmaşık —
          // sıralı update varsayımı (due[i] sırasıyla).
          const idx = state.updates.length;
          const schedule = state.dueSchedules[idx];
          state.updates.push({
            scheduleId: schedule?.id ?? 'unknown',
            ...values,
          });
          return Promise.resolve();
        },
      }),
    }),
    transaction: async <T>(cb: (tx: typeof txDb) => Promise<T>): Promise<T> => {
      return cb(txDb);
    },
  };

  return { db: txDb as unknown as Parameters<typeof processReportScheduleTick>[0]['db'] };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

const TICK_AT = new Date('2026-05-24T07:00:00Z'); // Istanbul 10:00

describe('processReportScheduleTick', () => {
  it('boş due → no-op (scanned=0)', async () => {
    const state: FakeDbState = {
      dueSchedules: [],
      savedReports: new Map(),
      inserts: [],
      updates: [],
    };
    const { db } = fakeDb(state);
    const enqueueReportRender = vi.fn();
    const result = await processReportScheduleTick({
      db,
      enqueueReportRender,
      now: () => TICK_AT,
    });
    expect(result).toEqual({ scanned: 0, enqueued: 0, failed: 0 });
    expect(enqueueReportRender).not.toHaveBeenCalled();
  });

  it('1 due schedule → render INSERT + schedule UPDATE + 1 enqueue', async () => {
    const saved = makeSaved();
    const state: FakeDbState = {
      dueSchedules: [makeSchedule()],
      savedReports: new Map([[saved.id, saved]]),
      inserts: [],
      updates: [],
    };
    const { db } = fakeDb(state);
    const enqueueReportRender = vi.fn(async () => 'ok');
    const result = await processReportScheduleTick({
      db,
      enqueueReportRender,
      now: () => TICK_AT,
    });
    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(result.failed).toBe(0);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      scheduleId: 'sch-1',
      savedReportId: 'sr-1',
    });
    expect(enqueueReportRender).toHaveBeenCalledWith({ renderId: 'r-new-1' });
  });

  it('saved silinmiş → schedule pasif yapılır, render INSERT atlanır', async () => {
    const state: FakeDbState = {
      dueSchedules: [makeSchedule({ savedReportId: 'sr-deleted' })],
      savedReports: new Map(), // saved yok
      inserts: [],
      updates: [],
    };
    const { db } = fakeDb(state);
    const enqueueReportRender = vi.fn();
    const result = await processReportScheduleTick({
      db,
      enqueueReportRender,
      now: () => TICK_AT,
    });
    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ isActive: false });
    expect(enqueueReportRender).not.toHaveBeenCalled();
  });

  it('enqueue fail → result.failed +=1, diğer akış devam (schedule update yapıldı)', async () => {
    const saved = makeSaved();
    const state: FakeDbState = {
      dueSchedules: [makeSchedule()],
      savedReports: new Map([[saved.id, saved]]),
      inserts: [],
      updates: [],
    };
    const { db } = fakeDb(state);
    const enqueueReportRender = vi.fn(async () => {
      throw new Error('redis blip');
    });
    const result = await processReportScheduleTick({
      db,
      enqueueReportRender,
      now: () => TICK_AT,
    });
    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(result.failed).toBe(1);
    // DB row insert yapıldı + update yapıldı; sweeper recover edebilir.
    expect(state.inserts).toHaveLength(1);
    expect(state.updates).toHaveLength(1);
  });

  it('nextRunAt güncellenir (computeNextRunAt sonucu, daily 09:00 + tickAt 10:00 → yarın 09:00)', async () => {
    const saved = makeSaved();
    const state: FakeDbState = {
      dueSchedules: [makeSchedule({ cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 } })],
      savedReports: new Map([[saved.id, saved]]),
      inserts: [],
      updates: [],
    };
    const { db } = fakeDb(state);
    await processReportScheduleTick({
      db,
      enqueueReportRender: vi.fn(),
      now: () => TICK_AT,
    });
    const update = state.updates[0]!;
    expect(update.nextRunAt).toBeInstanceOf(Date);
    // Yarın 09:00 Istanbul = 06:00Z (UTC+3)
    expect(update.nextRunAt!.toISOString()).toBe('2026-05-25T06:00:00.000Z');
  });
});
