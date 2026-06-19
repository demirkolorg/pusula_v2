import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface WipCountData {
  items: Array<{ listId: string; listName: string; openCount: number }>;
  totalOpen: number;
}

export function WipCount(props: MicroReportProps<WipCountData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.wipCount.title');
  if (data.items.length === 0 || data.totalOpen === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.wipCount.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <div className="flex flex-col gap-2">
        <span className="text-3xl font-semibold tabular-nums">{data.totalOpen}</span>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.items} layout="vertical" accessibilityLayer role="img">
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="listName" fontSize={11} width={110} />
              <Bar
                dataKey="openCount"
                fill="var(--color-primary)"
                radius={[0, 3, 3, 0]}
                isAnimationActive={mode === 'panel'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MicroReportShell>
  );
}

export const wipCountManifest: MicroReportUiManifest<WipCountData> = {
  id: 'wip-count',
  Component: WipCount,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'listId', key: 'listId', width: 16 },
        { header: 'listName', key: 'listName', width: 24 },
        { header: 'openCount', key: 'openCount', width: 12 },
      ],
      rows: data.items,
    };
  },
};
