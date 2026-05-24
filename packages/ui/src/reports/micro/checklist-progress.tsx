import { CheckCircle2 } from 'lucide-react';
import { Progress } from '../../components/progress';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface ChecklistProgressData {
  total: number;
  completed: number;
  percentage: number | null;
}

export function ChecklistProgress(props: MicroReportProps<ChecklistProgressData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.checklistProgress.title');
  if (data.total === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.checklistProgress.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const isComplete = data.percentage === 100;
  const pctText = data.percentage === null
    ? '—'
    : new Intl.NumberFormat(locale, { style: 'percent' }).format(data.percentage / 100);
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={200}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{pctText}</span>
          <span className="text-sm text-muted-foreground">
            {t('reports.microReports.checklistProgress.ratio', {
              completed: data.completed,
              total: data.total,
            })}
          </span>
        </div>
        <Progress value={data.percentage ?? 0} />
        {isComplete ? (
          <div
            data-slot="checklist-complete-badge"
            className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            role="status"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            <span>{t('reports.microReports.checklistProgress.celebrate')}</span>
          </div>
        ) : null}
      </div>
    </MicroReportShell>
  );
}

export const checklistProgressManifest: MicroReportUiManifest<ChecklistProgressData> = {
  id: 'checklist-progress',
  Component: ChecklistProgress,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 18 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [
        { metric: 'total', value: data.total },
        { metric: 'completed', value: data.completed },
        { metric: 'percentage', value: data.percentage },
      ],
    };
  },
};
