import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from '../primitives/chart-frame';
import { DataTable, type DataTableColumn } from '../primitives/data-table';
import { DeltaBadge } from '../primitives/delta-badge';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import { mergeByIdentity, type IdentityMergedRow } from '../lib/merge-comparison';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface MemberContributionRow {
  userId: string;
  count: number;
}

export interface MemberContributionData {
  total: number;
  contributors: MemberContributionRow[];
}

const TOP_N_PANEL = 10;

export function MemberContribution(props: MicroReportProps<MemberContributionData>) {
  const { data, comparisonData, t, locale, mode } = props;
  const title = t('reports.microReports.memberContribution.title');
  if (data.contributors.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.memberContribution.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  // Faz 13M (DEM-269) — userId bazlı merge ile Δ kolonu + chart'ta noktalı
  // previous bar serisi. comparisonData null ise delta kolonu render edilmez.
  const merged: IdentityMergedRow<MemberContributionRow>[] = mergeByIdentity(
    data.contributors,
    comparisonData?.contributors ?? null,
    {
      getKey: (r) => r.userId,
      getValue: (r) => r.count,
    },
  );
  const visibleMerged = mode === 'panel' ? merged.slice(0, TOP_N_PANEL) : merged;
  const chartData = visibleMerged
    .filter((m) => m.row !== null)
    .map((m) => ({
      userId: m.row!.userId,
      count: m.row!.count,
      previous: m.previousValue ?? 0,
    }));
  const hasComparison = comparisonData != null;
  const columns: DataTableColumn<IdentityMergedRow<MemberContributionRow>>[] = [
    {
      key: 'userId',
      headerKey: 'reports.microReports.memberContribution.columns.user',
      render: (m) => m.row?.userId ?? '—',
    },
    {
      key: 'count',
      headerKey: 'reports.microReports.memberContribution.columns.count',
      render: (m) => (m.row ? m.row.count : 0),
      numeric: true,
    },
  ];
  if (hasComparison) {
    columns.push({
      key: 'delta',
      headerKey: 'reports.comparison.deltaColumnHeader',
      render: (m) =>
        m.delta ? (
          <DeltaBadge delta={m.delta} t={t} locale={locale} mode={mode} />
        ) : (
          '—'
        ),
      numeric: true,
    });
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={320}>
      <ChartFrame
        mode={mode}
        height={220}
        ariaLabel={t('reports.microReports.memberContribution.chartAriaLabel')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} accessibilityLayer>
            <XAxis dataKey="userId" hide />
            <YAxis />
            {mode === 'panel' ? <Tooltip /> : null}
            {hasComparison ? (
              <Bar
                dataKey="previous"
                fill="var(--color-muted-foreground)"
                fillOpacity={0.35}
                isAnimationActive={mode === 'panel'}
              />
            ) : null}
            <Bar dataKey="count" fill="var(--color-primary)" isAnimationActive={mode === 'panel'} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <DataTable
        columns={columns}
        rows={visibleMerged}
        getRowKey={(m) => m.rowKey}
        t={t}
        mode={mode}
        panelLimit={null}
      />
    </MicroReportShell>
  );
}

export const memberContributionManifest: MicroReportUiManifest<MemberContributionData> = {
  id: 'member-contribution',
  Component: MemberContribution,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'userId', key: 'userId', width: 16 },
        { header: 'count', key: 'count', width: 12 },
      ],
      rows: data.contributors.map((c) => ({ userId: c.userId, count: c.count })),
    };
  },
};
