import { ArrowRightIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface ListFlowData {
  edges: Array<{
    fromListId: string | null;
    fromListName: string | null;
    toListId: string;
    toListName: string;
    count: number;
  }>;
  totalMoves: number;
}

export function ListFlow(props: MicroReportProps<ListFlowData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.listFlow.title');
  if (data.edges.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={4} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.listFlow.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const max = Math.max(...data.edges.map((e) => e.count));
  return (
    <MicroReportShell title={title} colSpan={4} mode={mode} minHeight={320}>
      <ul className="space-y-1.5">
        {data.edges.map((e, idx) => {
          const pct = max > 0 ? (e.count / max) * 100 : 0;
          return (
            <li key={`${e.fromListId}-${e.toListId}-${idx}`} className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-right">
                  {e.fromListName ?? t('reports.microReports.listFlow.unknownSource')}
                </span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate">{e.toListName}</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {e.count}
                </span>
              </div>
              <div className="h-1 rounded bg-muted">
                <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </MicroReportShell>
  );
}

export const listFlowManifest: MicroReportUiManifest<ListFlowData> = {
  id: 'list-flow',
  Component: ListFlow,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'fromListName', key: 'fromListName', width: 24 },
        { header: 'toListName', key: 'toListName', width: 24 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: data.edges,
    };
  },
};
