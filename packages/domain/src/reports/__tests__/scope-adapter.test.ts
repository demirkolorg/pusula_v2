import { describe, expect, it, vi } from 'vitest';
import {
  resolveRange,
  resolveRangePreset,
  runScopeAdapter,
  type QueryCtx,
  type ScopeAdapter,
} from '../scope-adapter';
import type { ReportFilters, ReportScope } from '../types';

function buildCtx(now: Date = new Date('2026-05-15T12:00:00Z')): QueryCtx {
  return {
    db: null,
    permissions: {
      accessibleBoardsInWorkspace: vi.fn(async () => []),
      accessibleListsInBoard: vi.fn(async () => []),
      hasBoardAccess: vi.fn(async () => true),
      hasWorkspaceAccess: vi.fn(async () => true),
      totalBoardsInWorkspace: vi.fn(async () => 0),
      totalListsInBoard: vi.fn(async () => 0),
    },
    userId: 'u1',
    now: () => now,
  };
}

const FILTERS: ReportFilters = {
  range: { kind: 'preset', preset: 'last30d' },
};

describe('runScopeAdapter', () => {
  it("dispatches to the correct handler ('board')", async () => {
    const card = vi.fn(async () => 'card-data');
    const board = vi.fn(async () => 'board-data');
    const adapter: ScopeAdapter<string> = { card, board };
    const ctx = buildCtx();
    const scope: ReportScope = { kind: 'board', boardId: 'b1', workspaceId: 'w1' };

    const result = await runScopeAdapter(adapter, ctx, scope, FILTERS);
    expect(result).toBe('board-data');
    expect(board).toHaveBeenCalledOnce();
    expect(card).not.toHaveBeenCalled();
  });

  it('dispatches to card handler', async () => {
    const card = vi.fn(async () => 'card-data');
    const ctx = buildCtx();
    const scope: ReportScope = {
      kind: 'card',
      cardId: 'c1',
      boardId: 'b1',
      workspaceId: 'w1',
    };
    const out = await runScopeAdapter({ card }, ctx, scope, FILTERS);
    expect(out).toBe('card-data');
  });

  it('dispatches to list and workspace handlers', async () => {
    const list = vi.fn(async () => 'L');
    const workspace = vi.fn(async () => 'W');
    const adapter: ScopeAdapter<string> = { list, workspace };
    const ctx = buildCtx();

    expect(
      await runScopeAdapter(
        adapter,
        ctx,
        { kind: 'list', listId: 'l1', boardId: 'b1', workspaceId: 'w1' },
        FILTERS,
      ),
    ).toBe('L');
    expect(
      await runScopeAdapter(adapter, ctx, { kind: 'workspace', workspaceId: 'w1' }, FILTERS),
    ).toBe('W');
  });

  it('throws when the adapter does not support the requested scope', async () => {
    const adapter: ScopeAdapter<string> = {
      board: async () => 'b',
    };
    const ctx = buildCtx();
    await expect(
      runScopeAdapter(adapter, ctx, { kind: 'workspace', workspaceId: 'w1' }, FILTERS),
    ).rejects.toThrow(/workspace.*scope/i);
  });

  it('passes filters and scope through verbatim', async () => {
    const board = vi.fn(async () => 42);
    const ctx = buildCtx();
    const filters: ReportFilters = {
      range: { kind: 'preset', preset: 'last7d' },
      members: { userIds: ['u1', 'u2'], relations: ['assignee'] },
    };
    const scope: ReportScope = { kind: 'board', boardId: 'b9', workspaceId: 'w1' };
    await runScopeAdapter({ board }, ctx, scope, filters);
    expect(board).toHaveBeenCalledWith(ctx, scope, filters);
  });
});

describe('resolveRange', () => {
  it('passes through custom ranges as Date objects', () => {
    const r = resolveRange(
      { kind: 'custom', from: '2026-05-01T00:00:00Z', to: '2026-05-31T23:59:59Z' },
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(r.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-05-31T23:59:59.000Z');
  });

  it('resolves preset ranges using injected `now`', () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const r = resolveRange({ kind: 'preset', preset: 'last7d' }, now);
    expect(r.to.getTime()).toBeGreaterThan(r.from.getTime());
    expect(r.to.getTime() - r.from.getTime()).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });
});

describe('resolveRangePreset', () => {
  // Local timezone-aware: tests use `getFullYear/Month/Date` (UTC-shifted by
  // host TZ). Burada timezone gerçekliği önemli değil — sadece preset
  // hesaplama mantığı (gün/ay sınırları) doğrulanır.
  const now = new Date(2026, 4, 15, 12, 0, 0); // 2026-05-15 12:00 local

  it('today: [start-of-today, end-of-now]', () => {
    const r = resolveRangePreset('today', now);
    expect(r.from.getDate()).toBe(15);
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getDate()).toBe(15);
    expect(r.to.getHours()).toBe(23);
  });

  it('yesterday: full day window', () => {
    const r = resolveRangePreset('yesterday', now);
    expect(r.from.getDate()).toBe(14);
    expect(r.to.getDate()).toBe(14);
    expect(r.to.getHours()).toBe(23);
  });

  it('last7d: 7 days back start to now', () => {
    const r = resolveRangePreset('last7d', now);
    // 2026-05-15 - 6 days = 2026-05-09
    expect(r.from.getDate()).toBe(9);
    expect(r.from.getHours()).toBe(0);
  });

  it('last30d: 30 days back', () => {
    const r = resolveRangePreset('last30d', now);
    // 2026-05-15 - 29 days = 2026-04-16
    expect(r.from.getMonth()).toBe(3); // 0-indexed = April
    expect(r.from.getDate()).toBe(16);
  });

  it('last90d: 90 days back', () => {
    const r = resolveRangePreset('last90d', now);
    // 2026-05-15 - 89 days = 2026-02-15
    expect(r.from.getMonth()).toBe(1);
    expect(r.from.getDate()).toBe(15);
  });

  it('thisMonth: first of month to now', () => {
    const r = resolveRangePreset('thisMonth', now);
    expect(r.from.getDate()).toBe(1);
    expect(r.from.getMonth()).toBe(4);
  });

  it('lastMonth: previous month start to last instant of last month', () => {
    const r = resolveRangePreset('lastMonth', now);
    expect(r.from.getMonth()).toBe(3); // April
    expect(r.from.getDate()).toBe(1);
    // last instant of April = 04-30 23:59:59.999 (endOfDay simetrisi)
    expect(r.to.getMonth()).toBe(3);
    expect(r.to.getDate()).toBe(30);
    expect(r.to.getHours()).toBe(23);
    expect(r.to.getMinutes()).toBe(59);
    expect(r.to.getSeconds()).toBe(59);
    expect(r.to.getMilliseconds()).toBe(999);
  });

  it('thisQuarter: quarter-start to now (Q2 for May)', () => {
    const r = resolveRangePreset('thisQuarter', now);
    expect(r.from.getMonth()).toBe(3); // April (Q2 start)
    expect(r.from.getDate()).toBe(1);
  });

  it('thisYear: Jan 1 to now', () => {
    const r = resolveRangePreset('thisYear', now);
    expect(r.from.getFullYear()).toBe(2026);
    expect(r.from.getMonth()).toBe(0);
    expect(r.from.getDate()).toBe(1);
  });

  it('lastMonth across year boundary (January → December prior year)', () => {
    const jan = new Date(2026, 0, 10, 12, 0, 0);
    const r = resolveRangePreset('lastMonth', jan);
    expect(r.from.getFullYear()).toBe(2025);
    expect(r.from.getMonth()).toBe(11); // December
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getFullYear()).toBe(2025);
    expect(r.to.getMonth()).toBe(11);
    expect(r.to.getDate()).toBe(31);
  });

  it('thisQuarter on January falls in Q1', () => {
    const jan = new Date(2026, 0, 15, 0, 0, 0);
    const r = resolveRangePreset('thisQuarter', jan);
    expect(r.from.getMonth()).toBe(0);
  });

  it('thisQuarter on December falls in Q4', () => {
    const dec = new Date(2026, 11, 15, 0, 0, 0);
    const r = resolveRangePreset('thisQuarter', dec);
    expect(r.from.getMonth()).toBe(9); // October (Q4 start)
  });

  it('last30d crossing a month boundary', () => {
    const may2 = new Date(2026, 4, 2, 12, 0, 0);
    const r = resolveRangePreset('last30d', may2);
    // 2026-05-02 - 29 days = 2026-04-03
    expect(r.from.getMonth()).toBe(3);
    expect(r.from.getDate()).toBe(3);
  });
});
