import { AtSignIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface MentionEdge {
  authorId: string;
  authorName: string | null;
  mentionedId: string;
  mentionedName: string | null;
  count: number;
}

export interface MentionGraphData {
  edges: MentionEdge[];
}

export function MentionGraph(props: MicroReportProps<MentionGraphData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.mentionGraph.title');
  if (data.edges.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.mentionGraph.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const max = Math.max(...data.edges.map((e) => e.count));
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <ul className="space-y-1.5">
        {data.edges.map((e) => {
          const pct = max > 0 ? (e.count / max) * 100 : 0;
          return (
            <li key={`${e.authorId}-${e.mentionedId}`} className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <AtSignIcon className="size-3 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  {e.authorName ?? e.authorId.slice(0, 6)}
                  <span className="mx-1 text-muted-foreground">→</span>
                  {e.mentionedName ?? e.mentionedId.slice(0, 6)}
                </span>
                <span className="ml-auto tabular-nums">{e.count}</span>
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

export const mentionGraphManifest: MicroReportUiManifest<MentionGraphData> = {
  id: 'mention-graph',
  Component: MentionGraph,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'authorId', key: 'authorId', width: 16 },
        { header: 'authorName', key: 'authorName', width: 20 },
        { header: 'mentionedId', key: 'mentionedId', width: 16 },
        { header: 'mentionedName', key: 'mentionedName', width: 20 },
        { header: 'count', key: 'count', width: 8 },
      ],
      rows: data.edges.map((e) => ({ ...e })),
    };
  },
};
