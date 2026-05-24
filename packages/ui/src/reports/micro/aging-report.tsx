import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface AgingReportData {
  buckets: Array<{ label: string; count: number }>;
  oldest: Array<{ cardId: string; title: string; lastActivityAt: string; ageDays: number }>;
  totalCards: number;
}

export function AgingReport(props: MicroReportProps<AgingReportData>) {
  const { data, t, mode, locale } = props;
  const title = t('reports.microReports.agingReport.title');
  if (data.totalCards === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.agingReport.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const limit = mode === 'panel' ? 5 : 20;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <div className="flex flex-col gap-3">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} accessibilityLayer role="img">
              <XAxis dataKey="label" fontSize={11} />
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
        <div className="text-xs text-muted-foreground">
          {t('reports.microReports.agingReport.oldestLabel')}
        </div>
        <ul className="space-y-1 text-sm">
          {data.oldest.slice(0, limit).map((item) => (
            <li key={item.cardId} className="flex items-center justify-between gap-2">
              <span className="truncate">{item.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t('reports.microReports.agingReport.daysAgo', {
                  days: item.ageDays,
                  date: dateFmt.format(new Date(item.lastActivityAt)),
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </MicroReportShell>
  );
}

export const agingReportManifest: MicroReportUiManifest<AgingReportData> = {
  id: 'aging-report',
  Component: AgingReport,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'cardId', key: 'cardId', width: 18 },
        { header: 'title', key: 'title', width: 30 },
        { header: 'lastActivityAt', key: 'lastActivityAt', width: 22 },
        { header: 'ageDays', key: 'ageDays', width: 10 },
      ],
      rows: data.oldest,
    };
  },
};
