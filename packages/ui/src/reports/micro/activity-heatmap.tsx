import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';
import { cn } from '../../lib/utils';

export interface ActivityHeatmapData {
  cells: Array<{ dayOfWeek: number; hour: number; count: number }>;
  maxCount: number;
  totalCount: number;
}

const DAY_LABELS = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function ActivityHeatmap(props: MicroReportProps<ActivityHeatmapData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.activityHeatmap.title');
  if (data.totalCount === 0) {
    return (
      <MicroReportShell title={title} colSpan={4} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.activityHeatmap.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  // 7×24 lookup
  const grid: Record<string, number> = {};
  for (const c of data.cells) grid[`${c.dayOfWeek}-${c.hour}`] = c.count;
  return (
    <MicroReportShell title={title} colSpan={4} mode={mode} minHeight={280}>
      <div className="overflow-x-auto">
        <table
          role="img"
          aria-label={t('reports.microReports.activityHeatmap.chartAriaLabel')}
          className="w-full border-separate border-spacing-0.5"
        >
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {Array.from({ length: 24 }, (_, h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-[9px] font-normal text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((day, dow) => (
              <tr key={dow}>
                <th scope="row" className="text-[10px] text-muted-foreground text-right pr-1">
                  {day}
                </th>
                {Array.from({ length: 24 }, (_, h) => {
                  const count = grid[`${dow}-${h}`] ?? 0;
                  const ratio = data.maxCount > 0 ? count / data.maxCount : 0;
                  return (
                    <td key={h} className="p-0">
                      <div
                        className={cn(
                          'h-4 w-full rounded-sm',
                          count > 0 ? 'bg-primary' : 'bg-muted/30',
                        )}
                        style={count > 0 ? { opacity: 0.15 + ratio * 0.85 } : undefined}
                        title={`${day} ${h}:00 — ${count}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MicroReportShell>
  );
}

export const activityHeatmapManifest: MicroReportUiManifest<ActivityHeatmapData> = {
  id: 'activity-heatmap',
  Component: ActivityHeatmap,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'dayOfWeek', key: 'dow', width: 10 },
        { header: 'hour', key: 'hour', width: 8 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: data.cells.map((c) => ({ dow: c.dayOfWeek, hour: c.hour, count: c.count })),
    };
  },
};
