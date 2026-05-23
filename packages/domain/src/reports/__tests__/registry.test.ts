import { describe, expect, it } from 'vitest';
import {
  getMicroReportById,
  getMicroReportsForScope,
  MICRO_REPORT_IDS,
  MICRO_REPORTS,
} from '../registry';
import { REPORT_I18N_KEYS } from '../i18n-keys';

describe('micro-report registry shape', () => {
  it('has exactly 30 micro-reports (§9.6)', () => {
    expect(MICRO_REPORT_IDS).toHaveLength(30);
  });

  it('every micro-report id is unique', () => {
    expect(new Set(MICRO_REPORT_IDS).size).toBe(MICRO_REPORT_IDS.length);
  });

  it('micro-report id is kebab-case and starts with a letter', () => {
    for (const id of MICRO_REPORT_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    }
  });

  it('every manifest has a non-empty supports list', () => {
    for (const id of MICRO_REPORT_IDS) {
      const m = MICRO_REPORTS[id];
      expect(m).toBeDefined();
      expect(m!.supports.length).toBeGreaterThan(0);
    }
  });

  it('every manifest defaultLayout colSpan is 1|2|3|4', () => {
    for (const id of MICRO_REPORT_IDS) {
      const m = MICRO_REPORTS[id]!;
      expect([1, 2, 3, 4]).toContain(m.defaultLayout.colSpan);
      expect(m.defaultLayout.minHeight).toBeGreaterThan(0);
    }
  });

  it('every manifest category is one of the four buckets', () => {
    for (const id of MICRO_REPORT_IDS) {
      expect(['activity', 'status', 'time', 'structure']).toContain(MICRO_REPORTS[id]!.category);
    }
  });
});

describe('getMicroReportById', () => {
  it('returns the manifest for a known id', () => {
    expect(getMicroReportById('burndown')?.category).toBe('status');
    expect(getMicroReportById('activity-timeline')?.supports).toContain('card');
  });

  it('returns undefined for an unknown id', () => {
    expect(getMicroReportById('not-a-thing')).toBeUndefined();
  });
});

describe('getMicroReportsForScope', () => {
  it('returns all 30 supports[].includes(scope) micro-reports for workspace', () => {
    const workspaceSupported = getMicroReportsForScope('workspace');
    // Hemen hemen tüm micro-report'lar workspace'i destekler — sayım §9.6'da
    // implicit; en azından her micro-report'un W'yi destek/destekmediği
    // tutarlı kalmalı.
    for (const m of workspaceSupported) {
      expect(m.supports).toContain('workspace');
    }
  });

  it('returns micro-reports whose supports include the given scope', () => {
    for (const scope of ['card', 'list', 'board', 'workspace'] as const) {
      const items = getMicroReportsForScope(scope);
      for (const m of items) {
        expect(m.supports).toContain(scope);
      }
    }
  });

  it("only ['board', 'workspace']-restricted micro-reports show up for those two scopes", () => {
    const burndown = MICRO_REPORTS['burndown']!;
    expect(burndown.supports).toEqual(['board', 'workspace']);
    expect(getMicroReportsForScope('card').map((m) => m.id)).not.toContain('burndown');
    expect(getMicroReportsForScope('list').map((m) => m.id)).not.toContain('burndown');
    expect(getMicroReportsForScope('board').map((m) => m.id)).toContain('burndown');
    expect(getMicroReportsForScope('workspace').map((m) => m.id)).toContain('burndown');
  });

  it('counts a few seed numbers against §9.6 table', () => {
    // §9.6: activity-heatmap = L/B/W (3 scope)
    expect(MICRO_REPORTS['activity-heatmap']!.supports).toEqual(['list', 'board', 'workspace']);
    // activity-timeline = C/L/B/W (4 scope)
    expect(MICRO_REPORTS['activity-timeline']!.supports).toEqual([
      'card',
      'list',
      'board',
      'workspace',
    ]);
    // member-presence = B/W (2 scope)
    expect(MICRO_REPORTS['member-presence']!.supports).toEqual(['board', 'workspace']);
  });
});

describe('i18n key bindings', () => {
  it('every micro-report id has a corresponding i18n title + emptyState key', () => {
    for (const id of MICRO_REPORT_IDS) {
      const entry = (
        REPORT_I18N_KEYS.microReports as Record<
          string,
          { title: string; emptyState: string } | undefined
        >
      )[id];
      expect(entry).toBeDefined();
      expect(entry?.title).toMatch(/^reports\.microReports\./);
      expect(entry?.emptyState).toMatch(/^reports\.microReports\./);
    }
  });
});
