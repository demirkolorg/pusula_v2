import { describe, expect, it } from 'vitest';
import { MICRO_REPORTS } from '@pusula/domain/reports';
import {
  MICRO_REPORT_COMPONENT_IDS,
  getMicroReportComponent,
} from '../registry';

describe('UI registry × domain registry alignment', () => {
  it('every UI manifest id is registered in the domain registry', () => {
    for (const id of MICRO_REPORT_COMPONENT_IDS) {
      expect(MICRO_REPORTS[id], `domain registry missing ${id}`).toBeDefined();
    }
  });

  it('UI manifest exposes Component for each id', () => {
    for (const id of MICRO_REPORT_COMPONENT_IDS) {
      const m = getMicroReportComponent(id);
      expect(m).toBeDefined();
      expect(m!.Component).toBeTypeOf('function');
    }
  });

  it('returns undefined for unknown id', () => {
    expect(getMicroReportComponent('not-a-thing')).toBeUndefined();
  });

  it('covers all 30 micro-reports after 13K', () => {
    expect(MICRO_REPORT_COMPONENT_IDS).toHaveLength(30);
    expect(MICRO_REPORT_COMPONENT_IDS).toEqual(
      expect.arrayContaining([
        // 13F (ilk 8)
        'activity-timeline',
        'checklist-progress',
        'due-date-overview',
        'entity-summary',
        'kpi-card',
        'label-distribution',
        'member-contribution',
        'status-breakdown',
        // 13K (kalan 22)
        'activity-breakdown',
        'activity-heatmap',
        'aging-report',
        'attachment-summary',
        'attachment-type-breakdown',
        'board-health-score',
        'burndown',
        'comment-volume',
        'completion-rate',
        'cycle-time',
        'description-coverage',
        'due-trend',
        'label-cooccurrence',
        'label-trend',
        'list-balance',
        'list-flow',
        'member-presence',
        'member-workload',
        'mention-graph',
        'recent-changes',
        'time-in-list',
        'wip-count',
      ]),
    );
  });
});
