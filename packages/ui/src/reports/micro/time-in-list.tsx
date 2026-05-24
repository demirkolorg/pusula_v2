import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface TimeInListData {
  items: Array<{ listId: string; listName: string; averageHours: number; cardCount: number }>;
}

function formatHours(h: number): string {
  if (h < 24) return `${Math.round(h)}sa`;
  return `${(h / 24).toFixed(1)}g`;
}

export function TimeInList(props: MicroReportProps<TimeInListData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.timeInList.title');
  if (data.items.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.timeInList.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const limit = mode === 'panel' ? 10 : 30;
  const max = Math.max(...data.items.map((i) => i.averageHours));
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <ul className="space-y-1.5">
        {data.items.slice(0, limit).map((item) => {
          const pct = max > 0 ? (item.averageHours / max) * 100 : 0;
          return (
            <li key={item.listId} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{item.listName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatHours(item.averageHours)} · {item.cardCount}
                </span>
              </div>
              <div className="h-1.5 rounded bg-muted">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </MicroReportShell>
  );
}

export const timeInListManifest: MicroReportUiManifest<TimeInListData> = {
  id: 'time-in-list',
  Component: TimeInList,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'listId', key: 'listId', width: 16 },
        { header: 'listName', key: 'listName', width: 24 },
        { header: 'averageHours', key: 'averageHours', width: 14 },
        { header: 'cardCount', key: 'cardCount', width: 12 },
      ],
      rows: data.items,
    };
  },
};
