import { CircleIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';
import { cn } from '../../lib/utils';

export interface MemberPresenceData {
  items: Array<{
    userId: string;
    name: string | null;
    lastActivityAt: string | null;
    recentEventCount: number;
    status: 'active' | 'inactive' | 'never';
  }>;
}

const STATUS_COLORS: Record<MemberPresenceData['items'][number]['status'], string> = {
  active: 'text-emerald-600',
  inactive: 'text-amber-600',
  never: 'text-muted-foreground',
};

export function MemberPresence(props: MicroReportProps<MemberPresenceData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.memberPresence.title');
  if (data.items.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.memberPresence.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const limit = mode === 'panel' ? 15 : 50;
  const visible = data.items.slice(0, limit);
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <ul className="divide-y">
        {visible.map((item) => (
          <li key={item.userId} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <CircleIcon
                className={cn('size-2 fill-current', STATUS_COLORS[item.status])}
                aria-hidden
              />
              <span className="text-sm">{item.name ?? item.userId.slice(0, 8)}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{item.recentEventCount}</span>
              <span>
                {item.lastActivityAt
                  ? dateFmt.format(new Date(item.lastActivityAt))
                  : t('reports.microReports.memberPresence.never')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </MicroReportShell>
  );
}

export const memberPresenceManifest: MicroReportUiManifest<MemberPresenceData> = {
  id: 'member-presence',
  Component: MemberPresence,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'userId', key: 'userId', width: 16 },
        { header: 'name', key: 'name', width: 20 },
        { header: 'lastActivityAt', key: 'lastActivityAt', width: 22 },
        { header: 'recentEventCount', key: 'recentEventCount', width: 14 },
        { header: 'status', key: 'status', width: 10 },
      ],
      rows: data.items,
    };
  },
};
