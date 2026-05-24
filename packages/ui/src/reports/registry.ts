import {
  activityBreakdownManifest,
  activityHeatmapManifest,
  activityTimelineManifest,
  agingReportManifest,
  attachmentSummaryManifest,
  attachmentTypeBreakdownManifest,
  boardHealthScoreManifest,
  burndownManifest,
  checklistProgressManifest,
  commentVolumeManifest,
  completionRateManifest,
  cycleTimeManifest,
  descriptionCoverageManifest,
  dueDateOverviewManifest,
  dueTrendManifest,
  entitySummaryManifest,
  kpiCardViewManifest,
  labelCooccurrenceManifest,
  labelDistributionManifest,
  labelTrendManifest,
  listBalanceManifest,
  listFlowManifest,
  memberContributionManifest,
  memberPresenceManifest,
  memberWorkloadManifest,
  mentionGraphManifest,
  recentChangesManifest,
  statusBreakdownManifest,
  timeInListManifest,
  wipCountManifest,
} from './micro';
import type { MicroReportUiManifest } from './types';

/**
 * Faz 13F + 13K — UI manifest registry (DEM-262 + DEM-267). Domain
 * `@pusula/domain/reports` `MICRO_REPORTS` (`MicroReportDataManifest`) ile
 * aynı `id` üstünden eşlenir.
 *
 * Tüm 30 micro-report 13K (DEM-267) ile tamamlandı.
 */
export const MICRO_REPORT_COMPONENTS: Readonly<
  Record<string, MicroReportUiManifest<unknown>>
> = Object.freeze({
  'activity-breakdown': activityBreakdownManifest as MicroReportUiManifest<unknown>,
  'activity-heatmap': activityHeatmapManifest as MicroReportUiManifest<unknown>,
  'activity-timeline': activityTimelineManifest as MicroReportUiManifest<unknown>,
  'aging-report': agingReportManifest as MicroReportUiManifest<unknown>,
  'attachment-summary': attachmentSummaryManifest as MicroReportUiManifest<unknown>,
  'attachment-type-breakdown': attachmentTypeBreakdownManifest as MicroReportUiManifest<unknown>,
  'board-health-score': boardHealthScoreManifest as MicroReportUiManifest<unknown>,
  burndown: burndownManifest as MicroReportUiManifest<unknown>,
  'checklist-progress': checklistProgressManifest as MicroReportUiManifest<unknown>,
  'comment-volume': commentVolumeManifest as MicroReportUiManifest<unknown>,
  'completion-rate': completionRateManifest as MicroReportUiManifest<unknown>,
  'cycle-time': cycleTimeManifest as MicroReportUiManifest<unknown>,
  'description-coverage': descriptionCoverageManifest as MicroReportUiManifest<unknown>,
  'due-date-overview': dueDateOverviewManifest as MicroReportUiManifest<unknown>,
  'due-trend': dueTrendManifest as MicroReportUiManifest<unknown>,
  'entity-summary': entitySummaryManifest as MicroReportUiManifest<unknown>,
  'kpi-card': kpiCardViewManifest as MicroReportUiManifest<unknown>,
  'label-cooccurrence': labelCooccurrenceManifest as MicroReportUiManifest<unknown>,
  'label-distribution': labelDistributionManifest as MicroReportUiManifest<unknown>,
  'label-trend': labelTrendManifest as MicroReportUiManifest<unknown>,
  'list-balance': listBalanceManifest as MicroReportUiManifest<unknown>,
  'list-flow': listFlowManifest as MicroReportUiManifest<unknown>,
  'member-contribution': memberContributionManifest as MicroReportUiManifest<unknown>,
  'member-presence': memberPresenceManifest as MicroReportUiManifest<unknown>,
  'member-workload': memberWorkloadManifest as MicroReportUiManifest<unknown>,
  'mention-graph': mentionGraphManifest as MicroReportUiManifest<unknown>,
  'recent-changes': recentChangesManifest as MicroReportUiManifest<unknown>,
  'status-breakdown': statusBreakdownManifest as MicroReportUiManifest<unknown>,
  'time-in-list': timeInListManifest as MicroReportUiManifest<unknown>,
  'wip-count': wipCountManifest as MicroReportUiManifest<unknown>,
});

export function getMicroReportComponent(
  id: string,
): MicroReportUiManifest<unknown> | undefined {
  return MICRO_REPORT_COMPONENTS[id];
}

export const MICRO_REPORT_COMPONENT_IDS: ReadonlyArray<string> = Object.keys(
  MICRO_REPORT_COMPONENTS,
);
