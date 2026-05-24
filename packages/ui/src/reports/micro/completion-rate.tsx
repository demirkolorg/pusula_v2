import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface CompletionRateData {
  totalCompleted: number;
  averagePerDay: number;
  buckets: Array<{ date: string; count: number }>;
}

export function CompletionRate(props: MicroReportProps<CompletionRateData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.completionRate.title');
  if (data.buckets.length === 0 || data.totalCompleted === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.completionRate.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const avgFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums text-foreground">
            {data.totalCompleted}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('reports.microReports.completionRate.avgPerDay', {
              value: avgFmt.format(data.averagePerDay),
            })}
          </span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} accessibilityLayer role="img">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) =>
                  new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(
                    new Date(v),
                  )
                }
                fontSize={11}
              />
              <YAxis fontSize={11} allowDecimals={false} />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
                isAnimationActive={mode === 'panel'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MicroReportShell>
  );
}

export const completionRateManifest: MicroReportUiManifest<CompletionRateData> = {
  id: 'completion-rate',
  Component: CompletionRate,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'date', key: 'date', width: 14 },
        { header: 'completed', key: 'count', width: 12 },
      ],
      rows: data.buckets.map((b) => ({ date: b.date.slice(0, 10), count: b.count })),
    };
  },
};
