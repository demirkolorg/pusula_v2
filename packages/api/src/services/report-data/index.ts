/**
 * Faz 13D + 13K — Micro-report query servis registry'si (DEM-260 + DEM-267).
 * `@pusula/domain/reports/registry`'deki manifest id'leri ile burada
 * exported adapter'lar match'lenir. Tüm 30 micro-report 13K ile tamam.
 */
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityBreakdownAdapter } from './activity-breakdown';
import { activityHeatmapAdapter } from './activity-heatmap';
import { activityTimelineAdapter } from './activity-timeline';
import { agingReportAdapter } from './aging-report';
import { attachmentSummaryAdapter } from './attachment-summary';
import { attachmentTypeBreakdownAdapter } from './attachment-type-breakdown';
import { boardHealthScoreAdapter } from './board-health-score';
import { burndownAdapter } from './burndown';
import { checklistProgressAdapter } from './checklist-progress';
import { commentVolumeAdapter } from './comment-volume';
import { completionRateAdapter } from './completion-rate';
import { cycleTimeAdapter } from './cycle-time';
import { descriptionCoverageAdapter } from './description-coverage';
import { dueDateOverviewAdapter } from './due-date-overview';
import { dueTrendAdapter } from './due-trend';
import { entitySummaryAdapter } from './entity-summary';
import { kpiCardAdapter } from './kpi-card';
import { labelCooccurrenceAdapter } from './label-cooccurrence';
import { labelDistributionAdapter } from './label-distribution';
import { labelTrendAdapter } from './label-trend';
import { listBalanceAdapter } from './list-balance';
import { listFlowAdapter } from './list-flow';
import { memberContributionAdapter } from './member-contribution';
import { memberPresenceAdapter } from './member-presence';
import { memberWorkloadAdapter } from './member-workload';
import { mentionGraphAdapter } from './mention-graph';
import { recentChangesAdapter } from './recent-changes';
import { statusBreakdownAdapter } from './status-breakdown';
import { timeInListAdapter } from './time-in-list';
import { wipCountAdapter } from './wip-count';

export const REPORT_DATA_ADAPTERS: Readonly<Record<string, ScopeAdapter<unknown>>> =
  Object.freeze({
    'activity-breakdown': activityBreakdownAdapter as ScopeAdapter<unknown>,
    'activity-heatmap': activityHeatmapAdapter as ScopeAdapter<unknown>,
    'activity-timeline': activityTimelineAdapter as ScopeAdapter<unknown>,
    'aging-report': agingReportAdapter as ScopeAdapter<unknown>,
    'attachment-summary': attachmentSummaryAdapter as ScopeAdapter<unknown>,
    'attachment-type-breakdown': attachmentTypeBreakdownAdapter as ScopeAdapter<unknown>,
    'board-health-score': boardHealthScoreAdapter as ScopeAdapter<unknown>,
    burndown: burndownAdapter as ScopeAdapter<unknown>,
    'checklist-progress': checklistProgressAdapter as ScopeAdapter<unknown>,
    'comment-volume': commentVolumeAdapter as ScopeAdapter<unknown>,
    'completion-rate': completionRateAdapter as ScopeAdapter<unknown>,
    'cycle-time': cycleTimeAdapter as ScopeAdapter<unknown>,
    'description-coverage': descriptionCoverageAdapter as ScopeAdapter<unknown>,
    'due-date-overview': dueDateOverviewAdapter as ScopeAdapter<unknown>,
    'due-trend': dueTrendAdapter as ScopeAdapter<unknown>,
    'entity-summary': entitySummaryAdapter as ScopeAdapter<unknown>,
    'kpi-card': kpiCardAdapter as ScopeAdapter<unknown>,
    'label-cooccurrence': labelCooccurrenceAdapter as ScopeAdapter<unknown>,
    'label-distribution': labelDistributionAdapter as ScopeAdapter<unknown>,
    'label-trend': labelTrendAdapter as ScopeAdapter<unknown>,
    'list-balance': listBalanceAdapter as ScopeAdapter<unknown>,
    'list-flow': listFlowAdapter as ScopeAdapter<unknown>,
    'member-contribution': memberContributionAdapter as ScopeAdapter<unknown>,
    'member-presence': memberPresenceAdapter as ScopeAdapter<unknown>,
    'member-workload': memberWorkloadAdapter as ScopeAdapter<unknown>,
    'mention-graph': mentionGraphAdapter as ScopeAdapter<unknown>,
    'recent-changes': recentChangesAdapter as ScopeAdapter<unknown>,
    'status-breakdown': statusBreakdownAdapter as ScopeAdapter<unknown>,
    'time-in-list': timeInListAdapter as ScopeAdapter<unknown>,
    'wip-count': wipCountAdapter as ScopeAdapter<unknown>,
  });

export function getReportDataAdapter(
  microReportId: string,
): ScopeAdapter<unknown> | undefined {
  return REPORT_DATA_ADAPTERS[microReportId];
}

export {
  activityBreakdownAdapter,
  activityHeatmapAdapter,
  activityTimelineAdapter,
  agingReportAdapter,
  attachmentSummaryAdapter,
  attachmentTypeBreakdownAdapter,
  boardHealthScoreAdapter,
  burndownAdapter,
  checklistProgressAdapter,
  commentVolumeAdapter,
  completionRateAdapter,
  cycleTimeAdapter,
  descriptionCoverageAdapter,
  dueDateOverviewAdapter,
  dueTrendAdapter,
  entitySummaryAdapter,
  kpiCardAdapter,
  labelCooccurrenceAdapter,
  labelDistributionAdapter,
  labelTrendAdapter,
  listBalanceAdapter,
  listFlowAdapter,
  memberContributionAdapter,
  memberPresenceAdapter,
  memberWorkloadAdapter,
  mentionGraphAdapter,
  recentChangesAdapter,
  statusBreakdownAdapter,
  timeInListAdapter,
  wipCountAdapter,
};
export type { ActivityBreakdownData } from './activity-breakdown';
export type { ActivityHeatmapData } from './activity-heatmap';
export type { ActivityTimelineData } from './activity-timeline';
export type { AgingReportData } from './aging-report';
export type { AttachmentSummaryData } from './attachment-summary';
export type { AttachmentTypeBreakdownData } from './attachment-type-breakdown';
export type { BoardHealthScoreData } from './board-health-score';
export type { BurndownData } from './burndown';
export type { ChecklistProgressData } from './checklist-progress';
export type { CommentVolumeData } from './comment-volume';
export type { CompletionRateData } from './completion-rate';
export type { CycleTimeData } from './cycle-time';
export type { DescriptionCoverageData } from './description-coverage';
export type { DueDateOverviewData } from './due-date-overview';
export type { DueTrendData } from './due-trend';
export type { EntitySummaryData } from './entity-summary';
export type { KpiCardData } from './kpi-card';
export type { LabelCooccurrenceData } from './label-cooccurrence';
export type { LabelDistributionData } from './label-distribution';
export type { LabelTrendData } from './label-trend';
export type { ListBalanceData } from './list-balance';
export type { ListFlowData } from './list-flow';
export type { MemberContributionData } from './member-contribution';
export type { MemberPresenceData } from './member-presence';
export type { MemberWorkloadData } from './member-workload';
export type { MentionGraphData } from './mention-graph';
export type { RecentChangesData } from './recent-changes';
export type { StatusBreakdownData } from './status-breakdown';
export type { TimeInListData } from './time-in-list';
export type { WipCountData } from './wip-count';
