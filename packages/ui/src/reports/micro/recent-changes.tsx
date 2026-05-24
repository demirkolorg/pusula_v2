import { ClockIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface RecentChangesData {
  events: Array<{
    id: string;
    type: string;
    actorId: string | null;
    createdAt: string;
    cardId: string | null;
  }>;
}

export function RecentChanges(props: MicroReportProps<RecentChangesData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.recentChanges.title');
  if (data.events.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.recentChanges.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={320}>
      <ol className="space-y-1.5">
        {data.events.map((ev) => (
          <li key={ev.id} className="flex items-start gap-2 text-sm">
            <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="truncate">{t(`reports.activity.types.${ev.type}`)}</p>
              <p className="text-xs text-muted-foreground">{fmt.format(new Date(ev.createdAt))}</p>
            </div>
          </li>
        ))}
      </ol>
    </MicroReportShell>
  );
}

export const recentChangesManifest: MicroReportUiManifest<RecentChangesData> = {
  id: 'recent-changes',
  Component: RecentChanges,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'id', key: 'id', width: 18 },
        { header: 'type', key: 'type', width: 20 },
        { header: 'actorId', key: 'actorId', width: 18 },
        { header: 'createdAt', key: 'createdAt', width: 22 },
        { header: 'cardId', key: 'cardId', width: 18 },
      ],
      rows: data.events,
    };
  },
};
