import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface LabelTrendData {
  series: Array<{
    labelId: string;
    labelName: string;
    color: string;
    buckets: Array<{ weekStart: string; count: number }>;
  }>;
}

export function LabelTrend(props: MicroReportProps<LabelTrendData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.labelTrend.title');
  if (data.series.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={3} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.labelTrend.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  // Tüm hafta birleşim setini al + her seri için lookup
  const weekSet = new Set<string>();
  for (const s of data.series) for (const b of s.buckets) weekSet.add(b.weekStart);
  const weeks = Array.from(weekSet).sort();
  const chartData = weeks.map((w) => {
    const point: Record<string, string | number> = { weekStart: w };
    for (const s of data.series) {
      point[s.labelName] = s.buckets.find((b) => b.weekStart === w)?.count ?? 0;
    }
    return point;
  });
  return (
    <MicroReportShell title={title} colSpan={3} mode={mode} minHeight={280}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} accessibilityLayer role="img">
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={(v: string) =>
                new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(
                  new Date(v),
                )
              }
              fontSize={10}
            />
            <YAxis fontSize={10} allowDecimals={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {data.series.map((s) => (
              <Line
                key={s.labelId}
                type="monotone"
                dataKey={s.labelName}
                stroke={s.color || 'var(--color-primary)'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={mode === 'panel'}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </MicroReportShell>
  );
}

export const labelTrendManifest: MicroReportUiManifest<LabelTrendData> = {
  id: 'label-trend',
  Component: LabelTrend,
  worksheetExport(data) {
    const rows: Array<Record<string, unknown>> = [];
    for (const s of data.series) {
      for (const b of s.buckets) {
        rows.push({ labelId: s.labelId, labelName: s.labelName, weekStart: b.weekStart, count: b.count });
      }
    }
    return {
      columns: [
        { header: 'labelId', key: 'labelId', width: 16 },
        { header: 'labelName', key: 'labelName', width: 20 },
        { header: 'weekStart', key: 'weekStart', width: 14 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows,
    };
  },
};
