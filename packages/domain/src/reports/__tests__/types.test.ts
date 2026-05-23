import { describe, expect, it } from 'vitest';
import {
  cadenceConfigSchema,
  comparisonConfigSchema,
  labelFilterSchema,
  memberFilterSchema,
  microReportSelectionSchema,
  reportExportSchema,
  reportFiltersSchema,
  reportRangeSchema,
  reportScopeSchema,
  restrictedScopeSchema,
  savedReportCreateSchema,
  savedReportPatchSchema,
  scheduleCreateSchema,
} from '../types';

describe('reportScopeSchema', () => {
  it('accepts each of the four scope shapes', () => {
    const inputs = [
      { kind: 'card', cardId: 'c1', boardId: 'b1', workspaceId: 'w1' },
      { kind: 'list', listId: 'l1', boardId: 'b1', workspaceId: 'w1' },
      { kind: 'board', boardId: 'b1', workspaceId: 'w1' },
      { kind: 'workspace', workspaceId: 'w1' },
    ];
    for (const i of inputs) {
      expect(reportScopeSchema.safeParse(i).success).toBe(true);
    }
  });

  it('rejects an unknown scope kind', () => {
    const r = reportScopeSchema.safeParse({ kind: 'project', workspaceId: 'w1' });
    expect(r.success).toBe(false);
  });

  it('rejects card scope missing required ids', () => {
    expect(
      reportScopeSchema.safeParse({ kind: 'card', cardId: 'c1', workspaceId: 'w1' }).success,
    ).toBe(false);
  });
});

describe('reportRangeSchema', () => {
  it('accepts each of the 9 range presets', () => {
    const presets = [
      'today',
      'yesterday',
      'last7d',
      'last30d',
      'last90d',
      'thisMonth',
      'lastMonth',
      'thisQuarter',
      'thisYear',
    ] as const;
    for (const p of presets) {
      expect(reportRangeSchema.safeParse({ kind: 'preset', preset: p }).success).toBe(true);
    }
  });

  it('accepts a custom range with from ≤ to', () => {
    expect(
      reportRangeSchema.safeParse({
        kind: 'custom',
        from: '2026-05-01T00:00:00Z',
        to: '2026-05-31T23:59:59Z',
      }).success,
    ).toBe(true);
  });

  it('rejects custom range where from > to', () => {
    const r = reportRangeSchema.safeParse({
      kind: 'custom',
      from: '2026-06-01T00:00:00Z',
      to: '2026-05-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-datetime strings in custom range', () => {
    expect(
      reportRangeSchema.safeParse({
        kind: 'custom',
        from: 'yesterday',
        to: 'today',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown preset values', () => {
    expect(
      reportRangeSchema.safeParse({ kind: 'preset', preset: 'last10d' }).success,
    ).toBe(false);
  });
});

describe('memberFilterSchema', () => {
  it('accepts userIds + relations subsets', () => {
    expect(
      memberFilterSchema.safeParse({
        userIds: ['u1', 'u2'],
        relations: ['assignee', 'actor'],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown relation', () => {
    expect(
      memberFilterSchema.safeParse({
        userIds: ['u1'],
        relations: ['assignee', 'reporter' /* not in enum */],
      }).success,
    ).toBe(false);
  });
});

describe('labelFilterSchema', () => {
  it('accepts and/or mode', () => {
    for (const mode of ['and', 'or'] as const) {
      expect(
        labelFilterSchema.safeParse({ labelIds: ['l1'], mode }).success,
      ).toBe(true);
    }
  });

  it('rejects unknown mode', () => {
    expect(
      labelFilterSchema.safeParse({ labelIds: ['l1'], mode: 'xor' }).success,
    ).toBe(false);
  });
});

describe('reportFiltersSchema', () => {
  it('accepts the smallest valid shape (range only)', () => {
    const r = reportFiltersSchema.safeParse({
      range: { kind: 'preset', preset: 'last30d' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a full filter set', () => {
    const r = reportFiltersSchema.safeParse({
      range: { kind: 'preset', preset: 'last7d' },
      members: { userIds: ['u1'], relations: ['assignee'] },
      labels: { labelIds: ['l1', 'l2'], mode: 'and' },
      scopeFilter: {
        cardStatus: ['open'],
        includeArchivedLists: false,
        checklistStatus: 'incomplete',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects when range is missing', () => {
    expect(reportFiltersSchema.safeParse({}).success).toBe(false);
  });
});

describe('comparisonConfigSchema', () => {
  it('accepts previousPeriod + sameLastYear modes', () => {
    for (const mode of ['previousPeriod', 'sameLastYear'] as const) {
      expect(
        comparisonConfigSchema.safeParse({ enabled: true, mode }).success,
      ).toBe(true);
    }
  });

  it('rejects unknown mode', () => {
    expect(
      comparisonConfigSchema.safeParse({ enabled: false, mode: 'monthOverMonth' }).success,
    ).toBe(false);
  });
});

describe('cadenceConfigSchema', () => {
  it('accepts daily { hour, minute }', () => {
    expect(
      cadenceConfigSchema.safeParse({ cadence: 'daily', hour: 9, minute: 30 }).success,
    ).toBe(true);
  });

  it('accepts weekly { dayOfWeek, hour, minute }', () => {
    expect(
      cadenceConfigSchema.safeParse({
        cadence: 'weekly',
        dayOfWeek: 1,
        hour: 9,
        minute: 0,
      }).success,
    ).toBe(true);
  });

  it("accepts monthly { dayOfMonth: 'last' }", () => {
    expect(
      cadenceConfigSchema.safeParse({
        cadence: 'monthly',
        dayOfMonth: 'last',
        hour: 9,
        minute: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects hour out of range', () => {
    expect(
      cadenceConfigSchema.safeParse({ cadence: 'daily', hour: 25, minute: 0 }).success,
    ).toBe(false);
  });

  it('rejects dayOfWeek out of 0-6', () => {
    expect(
      cadenceConfigSchema.safeParse({
        cadence: 'weekly',
        dayOfWeek: 7,
        hour: 9,
        minute: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects dayOfMonth 0 or 32', () => {
    expect(
      cadenceConfigSchema.safeParse({
        cadence: 'monthly',
        dayOfMonth: 0,
        hour: 9,
        minute: 0,
      }).success,
    ).toBe(false);
    expect(
      cadenceConfigSchema.safeParse({
        cadence: 'monthly',
        dayOfMonth: 32,
        hour: 9,
        minute: 0,
      }).success,
    ).toBe(false);
  });
});

describe('microReportSelectionSchema', () => {
  it('accepts a minimal selection', () => {
    expect(
      microReportSelectionSchema.safeParse({
        microReportId: 'activity-timeline',
        enabled: true,
      }).success,
    ).toBe(true);
  });

  it('accepts override colSpan', () => {
    expect(
      microReportSelectionSchema.safeParse({
        microReportId: 'kpi-card',
        enabled: true,
        override: { colSpan: 2 },
      }).success,
    ).toBe(true);
  });

  it('rejects override colSpan = 5', () => {
    expect(
      microReportSelectionSchema.safeParse({
        microReportId: 'kpi-card',
        enabled: true,
        override: { colSpan: 5 },
      }).success,
    ).toBe(false);
  });
});

describe('restrictedScopeSchema', () => {
  it('accepts valid excludedKind + count', () => {
    expect(
      restrictedScopeSchema.safeParse({ excludedKind: 'board', excludedCount: 2 }).success,
    ).toBe(true);
  });

  it('rejects negative count', () => {
    expect(
      restrictedScopeSchema.safeParse({ excludedKind: 'board', excludedCount: -1 }).success,
    ).toBe(false);
  });
});

describe('savedReportCreateSchema', () => {
  it('accepts a full create input', () => {
    const r = savedReportCreateSchema.safeParse({
      workspaceId: 'w1',
      scope: { kind: 'board', boardId: 'b1', workspaceId: 'w1' },
      presetId: 'board.health',
      title: '  Pano Sağlık  ',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [{ microReportId: 'kpi-card', enabled: true }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe('Pano Sağlık'); // trim'lendi
    }
  });

  it('rejects empty title', () => {
    expect(
      savedReportCreateSchema.safeParse({
        workspaceId: 'w1',
        scope: { kind: 'board', boardId: 'b1', workspaceId: 'w1' },
        presetId: 'board.health',
        title: '   ',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
      }).success,
    ).toBe(false);
  });
});

describe('savedReportPatchSchema', () => {
  it('accepts a partial patch with only id + title', () => {
    expect(
      savedReportPatchSchema.safeParse({ id: 's1', title: 'Yeni İsim' }).success,
    ).toBe(true);
  });

  it('rejects missing id', () => {
    expect(savedReportPatchSchema.safeParse({ title: 'x' }).success).toBe(false);
  });
});

describe('scheduleCreateSchema', () => {
  it('accepts a minimal daily schedule', () => {
    const r = scheduleCreateSchema.safeParse({
      savedReportId: 's1',
      cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.recipientUserIds).toEqual([]);
      expect(r.data.recipientEmails).toEqual([]);
      expect(r.data.isActive).toBe(true);
    }
  });

  it('lowercases recipient emails', () => {
    const r = scheduleCreateSchema.safeParse({
      savedReportId: 's1',
      cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
      recipientEmails: ['Alice@Example.COM'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.recipientEmails).toEqual(['alice@example.com']);
    }
  });

  it('rejects invalid recipient email', () => {
    expect(
      scheduleCreateSchema.safeParse({
        savedReportId: 's1',
        cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
        timezone: 'Europe/Istanbul',
        recipientEmails: ['not-an-email'],
      }).success,
    ).toBe(false);
  });
});

describe('reportExportSchema', () => {
  it('accepts saved source', () => {
    expect(
      reportExportSchema.safeParse({
        source: 'saved',
        savedReportId: 's1',
        format: 'pdf',
      }).success,
    ).toBe(true);
  });

  it('accepts adhoc source with asset target', () => {
    expect(
      reportExportSchema.safeParse({
        source: 'adhoc',
        workspaceId: 'w1',
        scope: { kind: 'workspace', workspaceId: 'w1' },
        presetId: 'workspace.executive-summary',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
        format: 'png',
        assetTarget: { microReportId: 'activity-heatmap' },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown source', () => {
    expect(
      reportExportSchema.safeParse({ source: 'magic', format: 'pdf' }).success,
    ).toBe(false);
  });
});
