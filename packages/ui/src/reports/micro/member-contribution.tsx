import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from '../primitives/chart-frame';
import { DataTable } from '../primitives/data-table';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface MemberContributionRow {
  userId: string;
  count: number;
}

export interface MemberContributionData {
  total: number;
  contributors: MemberContributionRow[];
}

const TOP_N_PANEL = 10;

export function MemberContribution(props: MicroReportProps<MemberContributionData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.memberContribution.title');
  if (data.contributors.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.memberContribution.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const visible =
    mode === 'panel' ? data.contributors.slice(0, TOP_N_PANEL) : data.contributors;
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={320}>
      <ChartFrame
        mode={mode}
        height={220}
        ariaLabel={t('reports.microReports.memberContribution.chartAriaLabel')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={visible} accessibilityLayer>
            <XAxis dataKey="userId" hide />
            <YAxis />
            {mode === 'panel' ? <Tooltip /> : null}
            <Bar dataKey="count" fill="var(--color-primary)" isAnimationActive={mode === 'panel'} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <DataTable
        columns={[
          {
            key: 'userId',
            headerKey: 'reports.microReports.memberContribution.columns.user',
            render: (r) => r.userId,
          },
          {
            key: 'count',
            headerKey: 'reports.microReports.memberContribution.columns.count',
            render: (r) => r.count,
            numeric: true,
          },
        ]}
        rows={data.contributors}
        getRowKey={(r) => r.userId}
        t={t}
        mode={mode}
        panelLimit={TOP_N_PANEL}
      />
    </MicroReportShell>
  );
}

export const memberContributionManifest: MicroReportUiManifest<MemberContributionData> = {
  id: 'member-contribution',
  Component: MemberContribution,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'userId', key: 'userId', width: 16 },
        { header: 'count', key: 'count', width: 12 },
      ],
      rows: data.contributors.map((c) => ({ userId: c.userId, count: c.count })),
    };
  },
};
