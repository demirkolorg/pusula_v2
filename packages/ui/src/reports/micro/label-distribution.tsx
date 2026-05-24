import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from '../primitives/chart-frame';
import { DataTable } from '../primitives/data-table';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import { labelColorVar } from '../lib/label-color-bridge';
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
  const { data, t, mode } = props;
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
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <ChartFrame
        mode={mode}
        height={200}
        ariaLabel={t('reports.microReports.labelDistribution.chartAriaLabel')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.labels} accessibilityLayer>
            <XAxis dataKey="name" />
            <YAxis />
            {mode === 'panel' ? <Tooltip /> : null}
            <Bar dataKey="count" isAnimationActive={mode === 'panel'}>
              {data.labels.map((label) => (
                <Cell key={label.labelId} fill={labelColorVar(label.color)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {mode === 'print' ? (
        <DataTable
          columns={[
            { key: 'name', headerKey: 'reports.microReports.labelDistribution.columns.label', render: (r) => r.name },
            { key: 'count', headerKey: 'reports.microReports.labelDistribution.columns.count', render: (r) => r.count, numeric: true },
          ]}
          rows={data.labels}
          getRowKey={(r) => r.labelId}
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
