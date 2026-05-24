import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from '../primitives/chart-frame';
import { DataTable, type DataTableColumn } from '../primitives/data-table';
import { DeltaBadge } from '../primitives/delta-badge';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import { labelColorVar } from '../lib/label-color-bridge';
import { mergeByIdentity, type IdentityMergedRow } from '../lib/merge-comparison';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface LabelDistributionRow {
  labelId: string;
  name: string;
  /**
   * `@pusula/domain` `LabelColor` (English token: `red`/`blue`/`green`/...);
   * `labelColorVar` Türkçe `--palet-*` token'una map eder
   * (DEM-262 code-review C1 — apps/web tarafında zaten benzer bridge var).
   */
  color: string;
  count: number;
}

export interface LabelDistributionData {
  total: number;
  labels: LabelDistributionRow[];
}

export function LabelDistribution(props: MicroReportProps<LabelDistributionData>) {
  const { data, comparisonData, t, locale, mode } = props;
  const title = t('reports.microReports.labelDistribution.title');
  if (data.labels.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.labelDistribution.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  // Faz 13M (DEM-269) — etiket bazında merge; print tablosunda Δ kolonu.
  const hasComparison = comparisonData != null;
  const merged: IdentityMergedRow<LabelDistributionRow>[] = mergeByIdentity(
    data.labels,
    comparisonData?.labels ?? null,
    {
      getKey: (r) => r.labelId,
      getValue: (r) => r.count,
    },
  );
  const chartData = merged
    .filter((m) => m.row !== null)
    .map((m) => ({
      labelId: m.row!.labelId,
      name: m.row!.name,
      color: m.row!.color,
      count: m.row!.count,
      previous: m.previousValue ?? 0,
    }));
  const tableColumns: DataTableColumn<IdentityMergedRow<LabelDistributionRow>>[] = [
    {
      key: 'name',
      headerKey: 'reports.microReports.labelDistribution.columns.label',
      render: (m) => m.row?.name ?? '—',
    },
    {
      key: 'count',
      headerKey: 'reports.microReports.labelDistribution.columns.count',
      render: (m) => (m.row ? m.row.count : 0),
      numeric: true,
    },
  ];
  if (hasComparison) {
    tableColumns.push({
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
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <ChartFrame
        mode={mode}
        height={200}
        ariaLabel={t('reports.microReports.labelDistribution.chartAriaLabel')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} accessibilityLayer>
            <XAxis dataKey="name" />
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
            <Bar dataKey="count" isAnimationActive={mode === 'panel'}>
              {chartData.map((label) => (
                <Cell key={label.labelId} fill={labelColorVar(label.color)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {mode === 'print' || hasComparison ? (
        <DataTable
          columns={tableColumns}
          rows={merged}
          getRowKey={(m) => m.rowKey}
          t={t}
          mode={mode}
          panelLimit={null}
        />
      ) : null}
    </MicroReportShell>
  );
}

export const labelDistributionManifest: MicroReportUiManifest<LabelDistributionData> = {
  id: 'label-distribution',
  Component: LabelDistribution,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'labelId', key: 'labelId', width: 14 },
        { header: 'name', key: 'name', width: 18 },
        { header: 'color', key: 'color', width: 12 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: data.labels.map((l) => ({
        labelId: l.labelId,
        name: l.name,
        color: l.color,
        count: l.count,
      })),
    };
  },
};
