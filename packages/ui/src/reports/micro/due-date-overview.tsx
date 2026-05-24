import { KpiCard } from '../primitives/kpi-card';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface DueDateOverviewData {
  overdue: number;
  dueSoon: number;
  upcoming: number;
  noDueDate: number;
  completed: number;
  total: number;
}

const SEGMENT_COLOR = {
  overdue: 'bg-rose-500',
  dueSoon: 'bg-amber-500',
  upcoming: 'bg-blue-500',
  noDueDate: 'bg-muted',
  completed: 'bg-emerald-500',
} as const;

function pctOf(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

export function DueDateOverview(props: MicroReportProps<DueDateOverviewData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.dueDateOverview.title');
  if (data.total === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.dueDateOverview.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const segments: Array<{ key: keyof typeof SEGMENT_COLOR; value: number; labelKey: string }> = [
    { key: 'overdue', value: data.overdue, labelKey: 'reports.microReports.dueDateOverview.segments.overdue' },
    { key: 'dueSoon', value: data.dueSoon, labelKey: 'reports.microReports.dueDateOverview.segments.dueSoon' },
    { key: 'upcoming', value: data.upcoming, labelKey: 'reports.microReports.dueDateOverview.segments.upcoming' },
    { key: 'noDueDate', value: data.noDueDate, labelKey: 'reports.microReports.dueDateOverview.segments.noDueDate' },
    { key: 'completed', value: data.completed, labelKey: 'reports.microReports.dueDateOverview.segments.completed' },
  ];
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <div className="flex flex-col gap-3">
        {/*
         * A11y S-3 (DEM-262): dış div `role="img"` composite; inner segment'ler
         * presentational (`aria-hidden`) — accessible kaynak altta KPI grid.
         * SR aynı veriyi 3 kez okumaz (bar segment + dış aria + KPI).
         */}
        <div
          role="img"
          aria-label={t('reports.microReports.dueDateOverview.barAriaLabel')}
          className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          {segments.map((seg) =>
            seg.value > 0 ? (
              <div
                key={seg.key}
                className={SEGMENT_COLOR[seg.key]}
                style={{ width: `${pctOf(seg.value, data.total)}%` }}
                aria-hidden
                title={`${t(seg.labelKey)}: ${seg.value}`}
              />
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {segments.map((seg) => (
            <KpiCard
              key={seg.key}
              labelKey={seg.labelKey}
              value={seg.value}
              size="sm"
              mode={mode}
              t={t}
              locale={locale}
              semantics={seg.key === 'overdue' ? 'inverse' : 'auto'}
            />
          ))}
        </div>
      </div>
    </MicroReportShell>
  );
}

export const dueDateOverviewManifest: MicroReportUiManifest<DueDateOverviewData> = {
  id: 'due-date-overview',
  Component: DueDateOverview,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 18 },
        { header: 'value', key: 'value', width: 10 },
      ],
      rows: [
        { metric: 'overdue', value: data.overdue },
        { metric: 'dueSoon', value: data.dueSoon },
        { metric: 'upcoming', value: data.upcoming },
        { metric: 'noDueDate', value: data.noDueDate },
        { metric: 'completed', value: data.completed },
        { metric: 'total', value: data.total },
      ],
    };
  },
};
