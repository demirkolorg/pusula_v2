import {
  activityTimelineManifest,
  checklistProgressManifest,
  dueDateOverviewManifest,
  entitySummaryManifest,
  kpiCardViewManifest,
  labelDistributionManifest,
  memberContributionManifest,
  statusBreakdownManifest,
} from './micro';
import type { MicroReportUiManifest } from './types';

/**
 * Faz 13F — UI manifest registry (DEM-262). Domain
 * `@pusula/domain/reports` `MICRO_REPORTS` (`MicroReportDataManifest`) ile
 * aynı `id` üstünden eşlenir.
 *
 * 13D ilk turunda 8 micro-report adapter implementli; UI da aynı 8'i
 * burada toplar. Eksik olanlar 13K (DEM-267) ile birlikte eklenecek.
 */
export const MICRO_REPORT_COMPONENTS: Readonly<
  Record<string, MicroReportUiManifest<unknown>>
> = Object.freeze({
  'activity-timeline': activityTimelineManifest as MicroReportUiManifest<unknown>,
  'checklist-progress': checklistProgressManifest as MicroReportUiManifest<unknown>,
  'due-date-overview': dueDateOverviewManifest as MicroReportUiManifest<unknown>,
  'entity-summary': entitySummaryManifest as MicroReportUiManifest<unknown>,
  'kpi-card': kpiCardViewManifest as MicroReportUiManifest<unknown>,
  'label-distribution': labelDistributionManifest as MicroReportUiManifest<unknown>,
  'member-contribution': memberContributionManifest as MicroReportUiManifest<unknown>,
  'status-breakdown': statusBreakdownManifest as MicroReportUiManifest<unknown>,
});

export function getMicroReportComponent(
  id: string,
): MicroReportUiManifest<unknown> | undefined {
  return MICRO_REPORT_COMPONENTS[id];
}

export const MICRO_REPORT_COMPONENT_IDS: ReadonlyArray<string> = Object.keys(
  MICRO_REPORT_COMPONENTS,
);
