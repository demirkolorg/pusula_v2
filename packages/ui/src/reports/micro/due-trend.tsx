import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface DueTrendData {
  totalUpcoming: number;
  buckets: Array<{ date: string; count: number }>;
}

export function DueTrend(props: MicroReportProps<DueTrendData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.dueTrend.title');
  if (data.totalUpcoming === 0) {
    return (
      <MicroReportShell title={title} colSpan={3} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.dueTrend.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={3} mode={mode} minHeight={280}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">{data.totalUpcoming}</span>
          <span className="text-sm text-muted-foreground">
            {t('reports.microReports.dueTrend.next30Days')}
          </span>
        </div>
        <div className="h-44">
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
                fontSize={10}
                interval="preserveStartEnd"
              />
              <YAxis fontSize={10} allowDecimals={false} />
              <Bar
                dataKey="count"
                fill="var(--color-primary)"
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

export const dueTrendManifest: MicroReportUiManifest<DueTrendData> = {
  id: 'due-trend',
  Component: DueTrend,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'date', key: 'date', width: 14 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: data.buckets,
    };
  },
};
