import { ActivityIcon } from 'lucide-react';
import { Progress } from '../../components/progress';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';
import { cn } from '../../lib/utils';

export interface BoardHealthScoreData {
  score: number;
  components: {
    avgAgeDays: number;
    wipOverload: number;
    stalePercentage: number;
    overduePercentage: number;
  };
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

export function BoardHealthScore(props: MicroReportProps<BoardHealthScoreData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.boardHealthScore.title');
  if (data.score === 0 && data.components.avgAgeDays === 0 && data.components.wipOverload === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.boardHealthScore.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const items: Array<{ key: string; value: string; weight: string }> = [
    {
      key: t('reports.microReports.boardHealthScore.components.avgAge'),
      value: `${data.components.avgAgeDays} ${t('reports.microReports.boardHealthScore.days')}`,
      weight: '30%',
    },
    {
      key: t('reports.microReports.boardHealthScore.components.wipOverload'),
      value: `${data.components.wipOverload}`,
      weight: '30%',
    },
    {
      key: t('reports.microReports.boardHealthScore.components.stale'),
      value: `${data.components.stalePercentage}%`,
      weight: '20%',
    },
    {
      key: t('reports.microReports.boardHealthScore.components.overdue'),
      value: `${data.components.overduePercentage}%`,
      weight: '20%',
    },
  ];
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded border bg-muted/30 p-3">
          <ActivityIcon className={cn('size-6', scoreClass(data.score))} aria-hidden />
          <div className="flex flex-col">
            <span className={cn('text-3xl font-semibold tabular-nums', scoreClass(data.score))}>
              {data.score}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('reports.microReports.boardHealthScore.scoreLabel')}
            </span>
          </div>
          <div className="ml-auto w-32">
            <Progress value={data.score} />
          </div>
        </div>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {item.key} <span className="opacity-60">({item.weight})</span>
              </span>
              <span className="font-medium tabular-nums">{item.value}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground">
          {t('reports.microReports.boardHealthScore.formulaHint')}
        </p>
      </div>
    </MicroReportShell>
  );
}

export const boardHealthScoreManifest: MicroReportUiManifest<BoardHealthScoreData> = {
  id: 'board-health-score',
  Component: BoardHealthScore,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 22 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [
        { metric: 'score', value: data.score },
        { metric: 'avgAgeDays', value: data.components.avgAgeDays },
        { metric: 'wipOverload', value: data.components.wipOverload },
        { metric: 'stalePercentage', value: data.components.stalePercentage },
        { metric: 'overduePercentage', value: data.components.overduePercentage },
      ],
    };
  },
};
