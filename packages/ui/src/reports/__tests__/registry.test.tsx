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

  it('covers the 8 first-pass micro-reports', () => {
    expect(MICRO_REPORT_COMPONENT_IDS).toHaveLength(8);
    expect(MICRO_REPORT_COMPONENT_IDS).toEqual(
      expect.arrayContaining([
        'activity-timeline',
        'checklist-progress',
        'due-date-overview',
        'entity-summary',
        'kpi-card',
        'label-distribution',
        'member-contribution',
        'status-breakdown',
      ]),
    );
  });
});
