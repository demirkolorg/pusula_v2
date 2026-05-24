/**
 * Faz 13M (DEM-269) — micro-report comparison render testleri.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §13 + docs/domain/
 * 09-raporlama-kurallari.md §9.9.
 *
 * Doğrulanan davranışlar:
 *   - KPI delta rozeti `comparisonData` varken render edilir
 *   - DataTable Δ kolonu `comparisonData` varken görünür, yokken yok
 *   - StatusBreakdown her status için ayrı KPI delta
 *   - ChecklistProgress yüzde delta rozeti
 *   - Comparison kapalıyken hiçbir delta UI'sı sızıntı yapmaz
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  ActivityTimeline,
  type ActivityTimelineData,
} from '../../micro/activity-timeline';
import { MemberContribution } from '../../micro/member-contribution';
import { StatusBreakdown } from '../../micro/status-breakdown';
import { ChecklistProgress } from '../../micro/checklist-progress';
import { LabelDistribution } from '../../micro/label-distribution';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'card' as const, cardId: 'c1', boardId: 'b1', workspaceId: 'w1' };
const BOARD_SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

const activityFixture: ActivityTimelineData = {
  totalCount: 100,
  events: [
    {
      id: '1',
      type: 'card.created',
      actorId: 'u-1',
      createdAt: '2026-05-22T10:30:00Z',
      cardId: 'c-1',
      boardId: 'b-1',
    },
  ],
};

function findDeltaBadgeByDirection(
  container: HTMLElement,
  direction: 'up' | 'down' | 'neutral' | 'new',
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `[data-slot="delta-badge"][data-direction="${direction}"]`,
    ),
  );
}

describe('ActivityTimeline — comparison delta KPI', () => {
  it('comparisonData null → KPI delta rozeti yok', () => {
    const { container } = renderUi(
      <ActivityTimeline
        data={activityFixture}
        comparisonData={null}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      container.querySelectorAll('[data-slot="delta-badge"]').length,
    ).toBe(0);
    expect(
      screen.queryByText(/reports\.microReports\.activityTimeline\.totalEvents/),
    ).toBeNull();
  });

  it('comparisonData varsa KPI delta rozeti + previousLabel görünür', () => {
    const { container } = renderUi(
      <ActivityTimeline
        data={activityFixture}
        comparisonData={{ totalCount: 50, events: [] }}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.activityTimeline.totalEvents'),
    ).toBeInTheDocument();
    // direction='up' (100 vs 50 = +100%)
    expect(findDeltaBadgeByDirection(container, 'up').length).toBe(1);
  });
});

describe('StatusBreakdown — per-status KPI delta', () => {
  const current = { open: 30, completed: 20, archived: 5, total: 55 };

  it('comparisonData yokken delta rozeti yok', () => {
    const { container } = renderUi(
      <StatusBreakdown
        data={current}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      container.querySelectorAll('[data-slot="delta-badge"]').length,
    ).toBe(0);
  });

  it('comparisonData varken her status için delta rozeti', () => {
    const { container } = renderUi(
      <StatusBreakdown
        data={current}
        comparisonData={{ open: 20, completed: 15, archived: 5, total: 40 }}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    // 3 status → 3 delta rozeti (open up, completed up, archived neutral).
    expect(
      container.querySelectorAll('[data-slot="delta-badge"]').length,
    ).toBe(3);
    expect(findDeltaBadgeByDirection(container, 'up').length).toBeGreaterThanOrEqual(2);
    expect(findDeltaBadgeByDirection(container, 'neutral').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ChecklistProgress — percentage delta', () => {
  it('comparisonData yokken delta UI yok', () => {
    const { container } = renderUi(
      <ChecklistProgress
        data={{ total: 10, completed: 7, percentage: 70 }}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      container.querySelectorAll('[data-slot="delta-badge"]').length,
    ).toBe(0);
  });

  it('comparisonData varsa yüzde delta + Önceki etiketi', () => {
    const { container } = renderUi(
      <ChecklistProgress
        data={{ total: 10, completed: 7, percentage: 70 }}
        comparisonData={{ total: 10, completed: 5, percentage: 50 }}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    // 70 vs 50 → +40% → up rozeti.
    expect(findDeltaBadgeByDirection(container, 'up').length).toBe(1);
    expect(screen.getByText(/reports\.kpi\.previousLabel/)).toBeInTheDocument();
  });

  it('comparison previous.percentage null → direction=new', () => {
    const { container } = renderUi(
      <ChecklistProgress
        data={{ total: 10, completed: 7, percentage: 70 }}
        comparisonData={{ total: 0, completed: 0, percentage: null }}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    // previousPct=null → DeltaBadge "new" direction
    expect(findDeltaBadgeByDirection(container, 'new').length).toBe(1);
  });
});

describe('MemberContribution — Δ column + previous bar series', () => {
  const current = {
    total: 5,
    contributors: [
      { userId: 'alice', count: 4 },
      { userId: 'bob', count: 1 },
    ],
  };

  it('comparisonData yokken Δ kolonu görünmez', () => {
    renderUi(
      <MemberContribution
        data={current}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.queryByText('reports.comparison.deltaColumnHeader')).toBeNull();
  });

  it('comparisonData varken Δ kolonu + delta rozetleri görünür', () => {
    const { container } = renderUi(
      <MemberContribution
        data={current}
        comparisonData={{
          total: 3,
          contributors: [
            { userId: 'alice', count: 2 },
            { userId: 'bob', count: 1 },
          ],
        }}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.comparison.deltaColumnHeader'),
    ).toBeInTheDocument();
    // alice: 4 vs 2 = +100% → up
    expect(findDeltaBadgeByDirection(container, 'up').length).toBeGreaterThanOrEqual(1);
    // bob: 1 vs 1 = neutral
    expect(findDeltaBadgeByDirection(container, 'neutral').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LabelDistribution — Δ column merge', () => {
  const current = {
    total: 10,
    labels: [
      { labelId: 'l1', name: 'feature', color: 'blue', count: 7 },
      { labelId: 'l2', name: 'bug', color: 'red', count: 3 },
    ],
  };

  it('comparisonData varken Δ kolonu görünür + sadece previous-only label tail', () => {
    const { container } = renderUi(
      <LabelDistribution
        data={current}
        comparisonData={{
          total: 8,
          labels: [
            { labelId: 'l1', name: 'feature', color: 'blue', count: 4 },
            { labelId: 'l3', name: 'docs', color: 'green', count: 2 },
          ],
        }}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.comparison.deltaColumnHeader'),
    ).toBeInTheDocument();
    // bug → new (previous=null), feature → up, docs → down (current=0, previous=2)
    expect(findDeltaBadgeByDirection(container, 'new').length).toBeGreaterThanOrEqual(1);
    expect(findDeltaBadgeByDirection(container, 'up').length).toBeGreaterThanOrEqual(1);
    expect(findDeltaBadgeByDirection(container, 'down').length).toBeGreaterThanOrEqual(1);
  });
});
