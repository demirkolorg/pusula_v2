/**
 * Faz 13D + 13M — `renderReportDataset` unit testleri (DEM-260 + DEM-269).
 *
 * DB gerektirmez — mock `ScopeAdapter` ve `QueryCtx.now` injection. 13M
 * comparison branch testleri:
 *   - comparisonRange envelope'ta doğru ISO range döner
 *   - supportsComparison=true micro-report → comparisonData doluyor
 *   - supportsComparison=false → comparisonData her zaman null
 *   - Comparison query fail → comparisonData null, ana data düşmez
 *   - Comparison kapalı → comparisonRange null
 *   - Dual query previous range = shiftRangeBack(current)
 */
import { describe, expect, it } from 'vitest';
import type {
  PermissionsCtx,
  QueryCtx,
  ReportScope,
  ScopeAdapter,
} from '@pusula/domain/reports';
import { renderReportDataset } from './report-envelope';

const NOW = new Date('2026-05-24T00:00:00.000Z');

function makeCtx(overrides?: Partial<QueryCtx>): QueryCtx {
  const perms: PermissionsCtx = {
    accessibleBoardsInWorkspace: async () => [],
    accessibleListsInBoard: async () => [],
    hasBoardAccess: async () => true,
    hasWorkspaceAccess: async () => true,
    totalBoardsInWorkspace: async () => 0,
    totalListsInBoard: async () => 0,
  };
  return {
    db: {},
    permissions: perms,
    userId: 'u-1',
    now: () => NOW,
    ...overrides,
  };
}

const CARD_SCOPE: ReportScope = {
  kind: 'card',
  cardId: 'c-1',
  boardId: 'b-1',
  workspaceId: 'w-1',
};

describe('renderReportDataset — comparison branch (Faz 13M)', () => {
  it('comparison kapalı (null) → comparisonRange=null, comparisonData=null', async () => {
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async () => ({ count: 5 }),
    };
    const env = await renderReportDataset(
      makeCtx(),
      (id) => (id === 'activity-timeline' ? (adapter as ScopeAdapter<unknown>) : undefined),
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        comparison: null,
      },
    );
    expect(env.comparisonRange).toBeNull();
    const m = env.microReports.find((r) => r.id === 'activity-timeline');
    expect(m?.comparisonData).toBeNull();
    expect(m?.data).toEqual({ count: 5 });
  });

  it('comparison.enabled=false → comparisonRange=null (no dual query)', async () => {
    let calls = 0;
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async () => {
        calls += 1;
        return { count: 1 };
      },
    };
    const env = await renderReportDataset(
      makeCtx(),
      (id) => (id === 'activity-timeline' ? (adapter as ScopeAdapter<unknown>) : undefined),
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        comparison: { enabled: false, mode: 'previousPeriod' },
      },
    );
    expect(env.comparisonRange).toBeNull();
    // Sadece tek query (current) — comparison kapalı.
    expect(calls).toBe(1);
  });

  it('comparison.enabled=true + supportsComparison=true → comparisonData doluyor + comparisonRange ISO', async () => {
    // activity-timeline supports comparison; card.activity preset'inin
    // ilk micro-report'u olduğu için bu test deterministik.
    const callArgs: Array<{ range: { from: string; to: string } | { kind: string } }> = [];
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async (_ctx, _scope, filters) => {
        const r = filters.range;
        callArgs.push({ range: r as { kind: string; from: string; to: string } });
        if (r.kind === 'custom') return { count: 50 }; // previous
        return { count: 100 }; // current
      },
    };
    const env = await renderReportDataset(
      makeCtx(),
      (id) => (id === 'activity-timeline' ? (adapter as ScopeAdapter<unknown>) : undefined),
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        comparison: { enabled: true, mode: 'previousPeriod' },
      },
    );
    expect(env.comparisonRange).not.toBeNull();
    expect(env.comparisonRange!.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.comparisonRange!.to).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Previous range to == current range from (`shiftRangeBack`).
    expect(new Date(env.comparisonRange!.to).getTime()).toBeLessThan(NOW.getTime());

    const m = env.microReports.find((r) => r.id === 'activity-timeline');
    expect(m?.data).toEqual({ count: 100 });
    expect(m?.comparisonData).toEqual({ count: 50 });
    expect(m?.error).toBeNull();
    // 2 query çağrısı (current + previous).
    expect(callArgs).toHaveLength(2);
  });

  it('comparisonRange = shiftRangeBack(resolveRange(filter.range))', async () => {
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async () => ({ count: 1 }),
    };
    const env = await renderReportDataset(
      makeCtx(),
      () => adapter as ScopeAdapter<unknown>,
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: {
          range: {
            kind: 'custom',
            from: '2026-04-01T00:00:00.000Z',
            to: '2026-05-01T00:00:00.000Z',
          },
        },
        comparison: { enabled: true, mode: 'previousPeriod' },
      },
    );
    // duration = 30 days; previous = [2026-03-02, 2026-04-01]
    expect(env.comparisonRange).toEqual({
      from: '2026-03-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });
  });

  it('comparison query fail → comparisonData=null, ana data düşmez', async () => {
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async (_ctx, _scope, filters) => {
        if (filters.range.kind === 'custom') {
          throw new Error('previous range query failed');
        }
        return { count: 42 };
      },
    };
    const env = await renderReportDataset(
      makeCtx(),
      () => adapter as ScopeAdapter<unknown>,
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        comparison: { enabled: true, mode: 'previousPeriod' },
      },
    );
    const m = env.microReports.find((r) => r.id === 'activity-timeline');
    expect(m?.data).toEqual({ count: 42 });
    expect(m?.comparisonData).toBeNull();
    expect(m?.error).toBeNull();
  });

  it('current query fail → entire micro-report error; comparison skip', async () => {
    let prevCalls = 0;
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async (_ctx, _scope, filters) => {
        if (filters.range.kind === 'custom') {
          prevCalls += 1;
          return { count: 999 };
        }
        throw new Error('current query failed');
      },
    };
    const env = await renderReportDataset(
      makeCtx(),
      () => adapter as ScopeAdapter<unknown>,
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        comparison: { enabled: true, mode: 'previousPeriod' },
      },
    );
    const m = env.microReports.find((r) => r.id === 'activity-timeline');
    expect(m?.error?.code).toBe('query_failed');
    expect(m?.data).toBeNull();
    expect(m?.comparisonData).toBeNull();
    // current throw → previous query çağrılmadı (Promise.all değil sıralı).
    expect(prevCalls).toBe(0);
  });

  it('envelope.comparison field input.comparison ile birebir', async () => {
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async () => ({ count: 1 }),
    };
    const env = await renderReportDataset(
      makeCtx(),
      () => adapter as ScopeAdapter<unknown>,
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last7d' } },
        comparison: { enabled: true, mode: 'previousPeriod' },
      },
    );
    expect(env.comparison).toEqual({ enabled: true, mode: 'previousPeriod' });
  });
});

describe('renderReportDataset — restrictedScope branch (Faz 13O)', () => {
  const WS_SCOPE: ReportScope = { kind: 'workspace', workspaceId: 'w-1' };
  const BOARD_SCOPE: ReportScope = { kind: 'board', boardId: 'b-1', workspaceId: 'w-1' };

  it('card scope → restrictedScope null (alt entity yok)', async () => {
    const adapter: ScopeAdapter<{ count: number }> = {
      card: async () => ({ count: 1 }),
    };
    const env = await renderReportDataset(
      makeCtx(),
      () => adapter as ScopeAdapter<unknown>,
      {
        scope: CARD_SCOPE,
        presetId: 'card.activity',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toBeNull();
  });

  it('board scope V1 → restrictedScope null (list-level ACL yok)', async () => {
    const adapter: ScopeAdapter<unknown> = {
      board: async () => ({ events: [], totalCount: 0 }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => [],
          accessibleListsInBoard: async () => ['l-1', 'l-2'],
          hasBoardAccess: async () => true,
          hasWorkspaceAccess: async () => false,
          totalBoardsInWorkspace: async () => 0,
          totalListsInBoard: async () => 5,
        },
      }),
      () => adapter,
      {
        scope: BOARD_SCOPE,
        presetId: 'board.health',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toBeNull();
  });

  it('workspace admin → restrictedScope null (her şeyi görür)', async () => {
    const adapter: ScopeAdapter<unknown> = {
      workspace: async () => ({ events: [], totalCount: 0 }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3', 'b-4', 'b-5'],
          accessibleListsInBoard: async () => [],
          hasBoardAccess: async () => true,
          hasWorkspaceAccess: async (_wsId, min) => min === 'admin' || min === 'member',
          totalBoardsInWorkspace: async () => 5,
          totalListsInBoard: async () => 0,
        },
      }),
      () => adapter,
      {
        scope: WS_SCOPE,
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toBeNull();
  });

  it('workspace member 3/5 board erişimli → { board, excludedCount: 2 }', async () => {
    const adapter: ScopeAdapter<unknown> = {
      workspace: async () => ({ events: [], totalCount: 0 }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3'],
          accessibleListsInBoard: async () => [],
          hasBoardAccess: async () => true,
          // member: admin değil ama workspace access var
          hasWorkspaceAccess: async (_wsId, min) => min !== 'admin' && min !== 'owner',
          totalBoardsInWorkspace: async () => 5,
          totalListsInBoard: async () => 0,
        },
      }),
      () => adapter,
      {
        scope: WS_SCOPE,
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toEqual({ excludedKind: 'board', excludedCount: 2 });
  });

  it('bilgi sızıntısı: rozet sadece sayı+kind taşır, dışlanan board id envelope.restrictedScope alanında YOK', async () => {
    // §9.4 — dışlanan b-4, b-5 hakkında envelope.restrictedScope'ta hiçbir
    // bilgi (id/name/title) bulunmamalı. Her micro-result data alanı kendi
    // query'sinin permission-filtered çıktısını taşır; rozet ayrı.
    const adapter: ScopeAdapter<unknown> = {
      workspace: async (_ctx, _scope, _filters) => ({
        // Permission-filtered data: yalnız 3 board'un eventleri.
        events: [
          { id: 'e1', boardId: 'b-1' },
          { id: 'e2', boardId: 'b-2' },
        ],
        totalCount: 2,
      }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3'],
          accessibleListsInBoard: async () => [],
          hasBoardAccess: async () => true,
          hasWorkspaceAccess: async (_wsId, min) => min !== 'admin' && min !== 'owner',
          totalBoardsInWorkspace: async () => 5,
          totalListsInBoard: async () => 0,
        },
      }),
      () => adapter,
      {
        scope: WS_SCOPE,
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    // Rozet alanı: SADECE excludedKind + excludedCount, başka entity bilgisi yok.
    expect(env.restrictedScope).not.toBeNull();
    expect(Object.keys(env.restrictedScope!).sort()).toEqual([
      'excludedCount',
      'excludedKind',
    ]);
    // Dışlanan board id'leri rozette geçmemeli.
    const rozetJson = JSON.stringify(env.restrictedScope);
    expect(rozetJson).not.toContain('b-4');
    expect(rozetJson).not.toContain('b-5');
  });

  it('workspace member, hiç board erişimi yok (5 board → 0 accessible) → { board, excludedCount: 5 }', async () => {
    const adapter: ScopeAdapter<unknown> = {
      workspace: async () => ({ events: [], totalCount: 0 }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => [],
          accessibleListsInBoard: async () => [],
          hasBoardAccess: async () => false,
          hasWorkspaceAccess: async (_wsId, min) => min !== 'admin' && min !== 'owner',
          totalBoardsInWorkspace: async () => 5,
          totalListsInBoard: async () => 0,
        },
      }),
      () => adapter,
      {
        scope: WS_SCOPE,
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toEqual({ excludedKind: 'board', excludedCount: 5 });
  });

  it('workspace member 0/0 board (boş workspace) → restrictedScope null', async () => {
    const adapter: ScopeAdapter<unknown> = {
      workspace: async () => ({ events: [], totalCount: 0 }),
    };
    const env = await renderReportDataset(
      makeCtx({
        permissions: {
          accessibleBoardsInWorkspace: async () => [],
          accessibleListsInBoard: async () => [],
          hasBoardAccess: async () => true,
          hasWorkspaceAccess: async (_wsId, min) => min !== 'admin' && min !== 'owner',
          totalBoardsInWorkspace: async () => 0,
          totalListsInBoard: async () => 0,
        },
      }),
      () => adapter,
      {
        scope: WS_SCOPE,
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      },
    );
    expect(env.restrictedScope).toBeNull();
  });
});
