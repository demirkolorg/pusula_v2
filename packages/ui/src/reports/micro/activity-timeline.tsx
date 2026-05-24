import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface ActivityTimelineEvent {
  id: string;
  type: string;
  actorId: string | null;
  createdAt: string;
  cardId: string | null;
  boardId: string | null;
}

export interface ActivityTimelineData {
  totalCount: number;
  events: ActivityTimelineEvent[];
}

const MAX_PANEL_ROWS = 25;
const MAX_PRINT_ROWS = 50;

export function ActivityTimeline(props: MicroReportProps<ActivityTimelineData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.activityTimeline.title');
  if (data.events.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={4} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.activityTimeline.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const limit = mode === 'panel' ? MAX_PANEL_ROWS : MAX_PRINT_ROWS;
  const visible = data.events.slice(0, limit);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return (
    <MicroReportShell title={title} colSpan={4} mode={mode} minHeight={320}>
      <ol
        data-slot="activity-timeline-list"
        className="flex flex-col gap-2 border-l border-border ps-4"
      >
        {visible.map((ev) => (
          <li key={ev.id} className="relative">
            <span
              className="absolute -left-[19px] top-1.5 size-2 rounded-full bg-primary"
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-medium text-foreground">
                {t(`reports.activity.types.${ev.type}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {dateFormat.format(new Date(ev.createdAt))}
              </span>
            </div>
            {ev.actorId ? (
              <p className="text-xs text-muted-foreground">{ev.actorId}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {data.totalCount > limit ? (
        <p className="mt-2 text-xs text-muted-foreground panel-only">
          {t('reports.dataTable.more', { count: data.totalCount - limit })}
        </p>
      ) : null}
    </MicroReportShell>
  );
}

export const activityTimelineManifest: MicroReportUiManifest<ActivityTimelineData> = {
  id: 'activity-timeline',
  Component: ActivityTimeline,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'id', key: 'id', width: 14 },
        { header: 'type', key: 'type', width: 24 },
        { header: 'actorId', key: 'actorId', width: 14 },
        { header: 'createdAt', key: 'createdAt', width: 24 },
      ],
      rows: data.events.map((e) => ({
        id: e.id,
        type: e.type,
        actorId: e.actorId,
        createdAt: e.createdAt,
      })),
    };
  },
};
