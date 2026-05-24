/**
 * Faz 13D — Micro-report query servis registry'si (DEM-260).
 * `@pusula/domain/reports/registry`'deki manifest id'leri ile burada
 * exported adapter'lar match'lenir. 13D ilk turunda 8 adapter implementli;
 * geri kalan 22 micro-report 13K (DEM-267) kapsamında eklenir.
 */
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityTimelineAdapter } from './activity-timeline';
import { checklistProgressAdapter } from './checklist-progress';
import { dueDateOverviewAdapter } from './due-date-overview';
import { entitySummaryAdapter } from './entity-summary';
import { kpiCardAdapter } from './kpi-card';
import { labelDistributionAdapter } from './label-distribution';
import { memberContributionAdapter } from './member-contribution';
import { statusBreakdownAdapter } from './status-breakdown';

/**
 * Id → adapter. 13D'de 8 adapter implementli; eksik olanlar
 * `renderReportDataset` orchestrator'da widget-level `error` ile
 * envelope'a yansır (rapor düşmez — §16.5 fail isolation).
 */
export const REPORT_DATA_ADAPTERS: Readonly<Record<string, ScopeAdapter<unknown>>> =
  Object.freeze({
    'activity-timeline': activityTimelineAdapter as ScopeAdapter<unknown>,
    'checklist-progress': checklistProgressAdapter as ScopeAdapter<unknown>,
    'due-date-overview': dueDateOverviewAdapter as ScopeAdapter<unknown>,
    'entity-summary': entitySummaryAdapter as ScopeAdapter<unknown>,
    'kpi-card': kpiCardAdapter as ScopeAdapter<unknown>,
    'label-distribution': labelDistributionAdapter as ScopeAdapter<unknown>,
    'member-contribution': memberContributionAdapter as ScopeAdapter<unknown>,
    'status-breakdown': statusBreakdownAdapter as ScopeAdapter<unknown>,
  });

/**
 * Adapter lookup — `renderReportDataset` orchestrator'a verilir. 13K'de
 * adapter eklendikçe bu map büyür; orchestrator missing adapter'ı
 * widget-level error olarak handle eder.
 */
export function getReportDataAdapter(
  microReportId: string,
): ScopeAdapter<unknown> | undefined {
  return REPORT_DATA_ADAPTERS[microReportId];
}

export {
  activityTimelineAdapter,
  checklistProgressAdapter,
  dueDateOverviewAdapter,
  entitySummaryAdapter,
  kpiCardAdapter,
  labelDistributionAdapter,
  memberContributionAdapter,
  statusBreakdownAdapter,
};
export type { ActivityTimelineData } from './activity-timeline';
export type { ChecklistProgressData } from './checklist-progress';
export type { DueDateOverviewData } from './due-date-overview';
export type { EntitySummaryData } from './entity-summary';
export type { KpiCardData } from './kpi-card';
export type { LabelDistributionData } from './label-distribution';
export type { MemberContributionData } from './member-contribution';
export type { StatusBreakdownData } from './status-breakdown';
