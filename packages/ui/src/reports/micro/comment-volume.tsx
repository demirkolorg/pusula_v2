import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface CommentVolumeData {
  totalCount: number;
  buckets: Array<{ date: string; count: number }>;
}

export function CommentVolume(props: MicroReportProps<CommentVolumeData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.commentVolume.title');
  if (data.totalCount === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.commentVolume.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <div className="flex flex-col gap-2">
        <span className="text-3xl font-semibold tabular-nums">{data.totalCount}</span>
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
                fontSize={10}
              />
              <YAxis fontSize={10} allowDecimals={false} />
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

export const commentVolumeManifest: MicroReportUiManifest<CommentVolumeData> = {
  id: 'comment-volume',
  Component: CommentVolume,
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
