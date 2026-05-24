import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface MemberWorkloadData {
  items: Array<{
    userId: string;
    name: string | null;
    open: number;
    completed: number;
    overdue: number;
    total: number;
  }>;
}

export function MemberWorkload(props: MicroReportProps<MemberWorkloadData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.memberWorkload.title');
  if (data.items.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.memberWorkload.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const limit = mode === 'panel' ? 20 : 50;
  const visible = data.items.slice(0, limit);
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={320}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">
              {t('reports.microReports.memberWorkload.column.member')}
            </th>
            <th scope="col" className="text-right font-medium">
              {t('reports.microReports.memberWorkload.column.open')}
            </th>
            <th scope="col" className="text-right font-medium">
              {t('reports.microReports.memberWorkload.column.completed')}
            </th>
            <th scope="col" className="text-right font-medium">
              {t('reports.microReports.memberWorkload.column.overdue')}
            </th>
            <th scope="col" className="text-right font-medium">
              {t('reports.microReports.memberWorkload.column.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.userId} className="border-b last:border-0">
              <td className="py-1.5">{row.name ?? row.userId.slice(0, 8)}</td>
              <td className="text-right tabular-nums">{row.open}</td>
              <td className="text-right tabular-nums">{row.completed}</td>
              <td className="text-right tabular-nums text-destructive">{row.overdue}</td>
              <td className="text-right tabular-nums font-medium">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.items.length > limit && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('reports.dataTable.more', { count: data.items.length - limit })}
        </p>
      )}
    </MicroReportShell>
  );
}

export const memberWorkloadManifest: MicroReportUiManifest<MemberWorkloadData> = {
  id: 'member-workload',
  Component: MemberWorkload,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'userId', key: 'userId', width: 16 },
        { header: 'name', key: 'name', width: 20 },
        { header: 'open', key: 'open', width: 8 },
        { header: 'completed', key: 'completed', width: 12 },
        { header: 'overdue', key: 'overdue', width: 10 },
        { header: 'total', key: 'total', width: 8 },
      ],
      rows: data.items,
    };
  },
};
