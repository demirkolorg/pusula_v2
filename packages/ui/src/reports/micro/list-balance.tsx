import { ScaleIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';
import { cn } from '../../lib/utils';

export interface ListBalanceData {
  items: Array<{ listId: string; listName: string; cardCount: number }>;
  average: number;
  standardDeviation: number;
  balanced: boolean;
}

export function ListBalance(props: MicroReportProps<ListBalanceData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.listBalance.title');
  if (data.items.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.listBalance.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const max = Math.max(...data.items.map((i) => i.cardCount));
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded border bg-muted/30 p-2">
          <div className="flex items-center gap-2">
            <ScaleIcon
              className={cn('size-4', data.balanced ? 'text-emerald-600' : 'text-amber-600')}
              aria-hidden
            />
            <span className="text-sm font-medium">
              {data.balanced
                ? t('reports.microReports.listBalance.balanced')
                : t('reports.microReports.listBalance.imbalanced')}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            σ={data.standardDeviation} / μ={data.average}
          </span>
        </div>
        <ul className="space-y-1">
          {data.items.map((i) => {
            const pct = max > 0 ? (i.cardCount / max) * 100 : 0;
            return (
              <li key={i.listId} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate">{i.listName}</span>
                  <span className="tabular-nums">{i.cardCount}</span>
                </div>
                <div className="h-1 rounded bg-muted">
                  <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </MicroReportShell>
  );
}

export const listBalanceManifest: MicroReportUiManifest<ListBalanceData> = {
  id: 'list-balance',
  Component: ListBalance,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'listId', key: 'listId', width: 16 },
        { header: 'listName', key: 'listName', width: 24 },
        { header: 'cardCount', key: 'cardCount', width: 12 },
      ],
      rows: data.items,
    };
  },
};
