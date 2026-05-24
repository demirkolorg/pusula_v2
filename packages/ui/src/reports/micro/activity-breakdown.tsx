import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface ActivityBreakdownData {
  items: Array<{ type: string; count: number }>;
  otherCount: number;
  totalCount: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent-foreground))',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
];

export function ActivityBreakdown(props: MicroReportProps<ActivityBreakdownData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.activityBreakdown.title');
  if (data.totalCount === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.activityBreakdown.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const display = [
    ...data.items.map((i) => ({
      label: t(`reports.activity.types.${i.type}`),
      count: i.count,
    })),
    ...(data.otherCount > 0
      ? [{ label: t('reports.microReports.activityBreakdown.other'), count: data.otherCount }]
      : []),
  ];
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={display} layout="vertical" accessibilityLayer role="img">
            <XAxis type="number" fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" fontSize={11} width={110} />
            <Bar
              dataKey="count"
              radius={[0, 3, 3, 0]}
              isAnimationActive={mode === 'panel'}
            >
              {display.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </MicroReportShell>
  );
}

export const activityBreakdownManifest: MicroReportUiManifest<ActivityBreakdownData> = {
  id: 'activity-breakdown',
  Component: ActivityBreakdown,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'type', key: 'type', width: 24 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: [
        ...data.items.map((i) => ({ type: i.type, count: i.count })),
        ...(data.otherCount > 0 ? [{ type: 'other', count: data.otherCount }] : []),
      ],
    };
  },
};
