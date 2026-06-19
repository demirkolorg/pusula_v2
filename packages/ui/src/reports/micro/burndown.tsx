import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface BurndownData {
  totalCards: number;
  buckets: Array<{ date: string; remaining: number; ideal: number }>;
}

export function Burndown(props: MicroReportProps<BurndownData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.burndown.title');
  if (data.totalCards === 0 || data.buckets.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={3} mode={mode}>
        <ReportEmptyState i18nKey="reports.microReports.burndown.emptyState" t={t} mode={mode} />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={3} mode={mode} minHeight={320}>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.buckets} accessibilityLayer role="img">
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
            <YAxis fontSize={11} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="remaining"
              name={t('reports.microReports.burndown.remaining')}
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={mode === 'panel'}
            />
            <Line
              type="monotone"
              dataKey="ideal"
              name={t('reports.microReports.burndown.ideal')}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </MicroReportShell>
  );
}

export const burndownManifest: MicroReportUiManifest<BurndownData> = {
  id: 'burndown',
  Component: Burndown,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'date', key: 'date', width: 14 },
        { header: 'remaining', key: 'remaining', width: 12 },
        { header: 'ideal', key: 'ideal', width: 12 },
      ],
      rows: data.buckets.map((b) => ({
        date: b.date.slice(0, 10),
        remaining: b.remaining,
        ideal: b.ideal,
      })),
    };
  },
};
