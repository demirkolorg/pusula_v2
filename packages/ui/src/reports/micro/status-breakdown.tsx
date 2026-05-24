import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartFrame } from '../primitives/chart-frame';
import { KpiCard } from '../primitives/kpi-card';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import { RestrictedScopeBanner } from '../primitives/restricted-scope-banner';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface StatusBreakdownData {
  open: number;
  completed: number;
  archived: number;
  total: number;
}

const COLORS = {
  open: 'var(--color-primary)',
  completed: 'var(--color-success, #10b981)',
  archived: 'var(--color-muted-foreground)',
} as const;

export function StatusBreakdown(props: MicroReportProps<StatusBreakdownData>) {
  const { data, t, mode, locale, restricted } = props;
  const title = t('reports.microReports.statusBreakdown.title');
  if (data.total === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.statusBreakdown.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const slices = [
    { name: t('reports.filters.scope.cardStatus.open'), key: 'open', value: data.open, color: COLORS.open },
    {
      name: t('reports.filters.scope.cardStatus.completed'),
      key: 'completed',
      value: data.completed,
      color: COLORS.completed,
    },
    {
      name: t('reports.filters.scope.cardStatus.archived'),
      key: 'archived',
      value: data.archived,
      color: COLORS.archived,
    },
  ].filter((s) => s.value > 0);

  return (
    <MicroReportShell
      title={title}
      colSpan={2}
      mode={mode}
      minHeight={280}
      topNote={
        restricted ? (
          <RestrictedScopeBanner restricted={restricted} t={t} mode={mode} />
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChartFrame
          mode={mode}
          height={200}
          ariaLabel={t('reports.microReports.statusBreakdown.chartAriaLabel')}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                isAnimationActive={mode === 'panel'}
              >
                {slices.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
              </Pie>
              {mode === 'panel' ? <Tooltip /> : null}
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="grid grid-cols-3 gap-2">
          <KpiCard
            labelKey="reports.filters.scope.cardStatus.open"
            value={data.open}
            size="sm"
            mode={mode}
            t={t}
            locale={locale}
          />
          <KpiCard
            labelKey="reports.filters.scope.cardStatus.completed"
            value={data.completed}
            size="sm"
            mode={mode}
            t={t}
            locale={locale}
          />
          <KpiCard
            labelKey="reports.filters.scope.cardStatus.archived"
            value={data.archived}
            size="sm"
            mode={mode}
            t={t}
            locale={locale}
          />
        </div>
      </div>
    </MicroReportShell>
  );
}

export const statusBreakdownManifest: MicroReportUiManifest<StatusBreakdownData> = {
  id: 'status-breakdown',
  Component: StatusBreakdown,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 20 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [
        { metric: 'open', value: data.open },
        { metric: 'completed', value: data.completed },
        { metric: 'archived', value: data.archived },
        { metric: 'total', value: data.total },
      ],
    };
  },
};
