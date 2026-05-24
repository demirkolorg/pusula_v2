/**
 * Faz 13K (DEM-267) — 22 yeni micro-report için toplu smoke test.
 * Her component: render + empty state + worksheetExport şekil kontrolü.
 * Mock-heavy yaklaşım: inline minimal fixture, recharts/canvas yok.
 */
import { describe, expect, it } from 'vitest';
import {
  ActivityBreakdown,
  ActivityHeatmap,
  AgingReport,
  AttachmentSummary,
  AttachmentTypeBreakdown,
  BoardHealthScore,
  Burndown,
  CommentVolume,
  CompletionRate,
  CycleTime,
  DescriptionCoverage,
  DueTrend,
  LabelCooccurrence,
  LabelTrend,
  ListBalance,
  ListFlow,
  MemberPresence,
  MemberWorkload,
  MentionGraph,
  RecentChanges,
  TimeInList,
  WipCount,
  activityBreakdownManifest,
  activityHeatmapManifest,
  agingReportManifest,
  attachmentSummaryManifest,
  attachmentTypeBreakdownManifest,
  boardHealthScoreManifest,
  burndownManifest,
  commentVolumeManifest,
  completionRateManifest,
  cycleTimeManifest,
  descriptionCoverageManifest,
  dueTrendManifest,
  labelCooccurrenceManifest,
  labelTrendManifest,
  listBalanceManifest,
  listFlowManifest,
  memberPresenceManifest,
  memberWorkloadManifest,
  mentionGraphManifest,
  recentChangesManifest,
  timeInListManifest,
  wipCountManifest,
} from '../../micro';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

function baseProps<T>(data: T) {
  return {
    data,
    scope: SCOPE,
    filters: FILTERS,
    t,
    locale: TEST_LOCALE,
    mode: 'panel' as const,
  };
}

describe('13K micro-reports — smoke', () => {
  it('ActivityBreakdown empty + worksheet', () => {
    renderUi(<ActivityBreakdown {...baseProps({ items: [], otherCount: 0, totalCount: 0 })} />);
    const out = activityBreakdownManifest.worksheetExport!({
      items: [{ type: 'card.created', count: 3 }],
      otherCount: 1,
      totalCount: 4,
    });
    expect(out.rows).toHaveLength(2);
  });

  it('ActivityHeatmap empty + worksheet', () => {
    const empty = { cells: [], maxCount: 0, totalCount: 0 };
    renderUi(<ActivityHeatmap {...baseProps(empty)} />);
    const filled = {
      cells: [{ dayOfWeek: 1, hour: 9, count: 4 }],
      maxCount: 4,
      totalCount: 4,
    };
    const out = activityHeatmapManifest.worksheetExport!(filled);
    expect(out.rows).toHaveLength(1);
  });

  it('AgingReport empty + worksheet', () => {
    renderUi(<AgingReport {...baseProps({ buckets: [], oldest: [], totalCards: 0 })} />);
    const out = agingReportManifest.worksheetExport!({
      buckets: [{ label: '0-7d', count: 2 }],
      oldest: [
        { cardId: 'c1', title: 'foo', lastActivityAt: '2026-05-01T00:00:00.000Z', ageDays: 99 },
      ],
      totalCards: 2,
    });
    expect(out.columns.length).toBeGreaterThan(0);
  });

  it('AttachmentSummary empty + worksheet', () => {
    const empty = {
      totalCount: 0,
      totalBytes: 0,
      byType: { image: 0, pdf: 0, office: 0, other: 0 },
    };
    renderUi(<AttachmentSummary {...baseProps(empty)} />);
    const out = attachmentSummaryManifest.worksheetExport!(empty);
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('AttachmentTypeBreakdown empty + worksheet', () => {
    renderUi(<AttachmentTypeBreakdown {...baseProps({ items: [] })} />);
    const out = attachmentTypeBreakdownManifest.worksheetExport!({
      items: [{ mimeType: 'image/png', count: 2, totalBytes: 1024, averageBytes: 512 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('BoardHealthScore empty + filled + worksheet', () => {
    const empty = {
      score: 0,
      components: { avgAgeDays: 0, wipOverload: 0, stalePercentage: 0, overduePercentage: 0 },
    };
    renderUi(<BoardHealthScore {...baseProps(empty)} />);
    const filled = {
      score: 75,
      components: { avgAgeDays: 12, wipOverload: 18, stalePercentage: 25, overduePercentage: 10 },
    };
    renderUi(<BoardHealthScore {...baseProps(filled)} />);
    const out = boardHealthScoreManifest.worksheetExport!(filled);
    expect(out.rows.length).toBeGreaterThanOrEqual(5);
  });

  it('Burndown empty + worksheet', () => {
    renderUi(<Burndown {...baseProps({ totalCards: 0, buckets: [] })} />);
    const out = burndownManifest.worksheetExport!({
      totalCards: 10,
      buckets: [{ date: '2026-05-01T00:00:00.000Z', remaining: 10, ideal: 9 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('CommentVolume empty + worksheet', () => {
    renderUi(<CommentVolume {...baseProps({ totalCount: 0, buckets: [] })} />);
    const out = commentVolumeManifest.worksheetExport!({
      totalCount: 3,
      buckets: [{ date: '2026-05-01T00:00:00.000Z', count: 3 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('CompletionRate empty + worksheet', () => {
    renderUi(
      <CompletionRate
        {...baseProps({ totalCompleted: 0, averagePerDay: 0, buckets: [] })}
      />,
    );
    const out = completionRateManifest.worksheetExport!({
      totalCompleted: 5,
      averagePerDay: 1.25,
      buckets: [{ date: '2026-05-01T00:00:00.000Z', count: 5 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('CycleTime empty + worksheet', () => {
    renderUi(
      <CycleTime
        {...baseProps({
          totalSamples: 0,
          p50Hours: null,
          p75Hours: null,
          p95Hours: null,
          averageHours: null,
          buckets: [],
        })}
      />,
    );
    const out = cycleTimeManifest.worksheetExport!({
      totalSamples: 4,
      p50Hours: 5,
      p75Hours: 8,
      p95Hours: 12,
      averageHours: 7,
      buckets: [{ label: '0-2', count: 1 }],
    });
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('DescriptionCoverage empty + worksheet', () => {
    renderUi(
      <DescriptionCoverage
        {...baseProps({ total: 0, withDescription: 0, percentage: null })}
      />,
    );
    const out = descriptionCoverageManifest.worksheetExport!({
      total: 10,
      withDescription: 7,
      percentage: 70,
    });
    expect(out.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('DueTrend empty + worksheet', () => {
    renderUi(<DueTrend {...baseProps({ totalUpcoming: 0, buckets: [] })} />);
    const out = dueTrendManifest.worksheetExport!({
      totalUpcoming: 2,
      buckets: [{ date: '2026-05-01T00:00:00.000Z', count: 2 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('LabelCooccurrence empty + worksheet', () => {
    renderUi(<LabelCooccurrence {...baseProps({ pairs: [] })} />);
    const out = labelCooccurrenceManifest.worksheetExport!({
      pairs: [
        {
          labelAId: 'a',
          labelAName: 'A',
          labelAColor: 'red',
          labelBId: 'b',
          labelBName: 'B',
          labelBColor: 'blue',
          count: 3,
        },
      ],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('LabelTrend empty + worksheet', () => {
    renderUi(<LabelTrend {...baseProps({ series: [] })} />);
    const out = labelTrendManifest.worksheetExport!({
      series: [
        {
          labelId: 'l1',
          labelName: 'urgent',
          color: 'red',
          buckets: [{ weekStart: '2026-05-04T00:00:00.000Z', count: 4 }],
        },
      ],
    });
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('ListBalance empty + worksheet', () => {
    renderUi(
      <ListBalance
        {...baseProps({ items: [], average: 0, standardDeviation: 0, balanced: true })}
      />,
    );
    const out = listBalanceManifest.worksheetExport!({
      items: [{ listId: 'l1', listName: 'Backlog', cardCount: 5 }],
      average: 5,
      standardDeviation: 0,
      balanced: true,
    });
    expect(out.rows).toHaveLength(1);
  });

  it('ListFlow empty + worksheet', () => {
    renderUi(<ListFlow {...baseProps({ edges: [], totalMoves: 0 })} />);
    const out = listFlowManifest.worksheetExport!({
      edges: [
        {
          fromListId: 'a',
          fromListName: 'Doing',
          toListId: 'b',
          toListName: 'Done',
          count: 4,
        },
      ],
      totalMoves: 4,
    });
    expect(out.rows).toHaveLength(1);
  });

  it('MemberPresence empty + worksheet', () => {
    renderUi(<MemberPresence {...baseProps({ items: [] })} />);
    const out = memberPresenceManifest.worksheetExport!({
      items: [
        {
          userId: 'u1',
          name: 'Demo',
          lastActivityAt: null,
          recentEventCount: 0,
          status: 'never' as const,
        },
      ],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('MemberWorkload empty + worksheet', () => {
    renderUi(<MemberWorkload {...baseProps({ items: [] })} />);
    const out = memberWorkloadManifest.worksheetExport!({
      items: [{ userId: 'u1', name: 'D', open: 2, completed: 5, overdue: 1, total: 8 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('MentionGraph empty + worksheet', () => {
    renderUi(<MentionGraph {...baseProps({ edges: [] })} />);
    const out = mentionGraphManifest.worksheetExport!({
      edges: [
        {
          authorId: 'u1',
          authorName: 'A',
          mentionedId: 'u2',
          mentionedName: 'B',
          count: 2,
        },
      ],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('RecentChanges empty + worksheet', () => {
    renderUi(<RecentChanges {...baseProps({ events: [] })} />);
    const out = recentChangesManifest.worksheetExport!({
      events: [
        {
          id: 'e1',
          type: 'card.created',
          actorId: 'u1',
          createdAt: '2026-05-01T00:00:00.000Z',
          cardId: 'c1',
        },
      ],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('TimeInList empty + worksheet', () => {
    renderUi(<TimeInList {...baseProps({ items: [] })} />);
    const out = timeInListManifest.worksheetExport!({
      items: [{ listId: 'l1', listName: 'Doing', averageHours: 24, cardCount: 4 }],
    });
    expect(out.rows).toHaveLength(1);
  });

  it('WipCount empty + worksheet', () => {
    renderUi(<WipCount {...baseProps({ items: [], totalOpen: 0 })} />);
    const out = wipCountManifest.worksheetExport!({
      items: [{ listId: 'l1', listName: 'Doing', openCount: 7 }],
      totalOpen: 7,
    });
    expect(out.rows).toHaveLength(1);
  });
});
