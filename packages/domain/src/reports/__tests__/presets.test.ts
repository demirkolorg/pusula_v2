import { describe, expect, it } from 'vitest';
import {
  getPresetById,
  getPresetsForScope,
  PRESET_IDS,
  PRESETS,
  type PresetManifest,
} from '../presets';
import { MICRO_REPORTS } from '../registry';
import type { ReportScopeKind } from '../types';

describe('preset registry shape', () => {
  it('has exactly 19 presets (§9.7)', () => {
    expect(PRESET_IDS).toHaveLength(19);
  });

  it('every preset id is unique', () => {
    const set = new Set(PRESET_IDS);
    expect(set.size).toBe(PRESET_IDS.length);
  });

  it('preset id format is `<scope>.<name>`', () => {
    for (const id of PRESET_IDS) {
      expect(id).toMatch(/^(card|list|board|workspace)\.[a-z][a-z0-9-]*$/);
    }
  });

  it('preset scopeKind matches the id prefix', () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      const prefix = id.split('.')[0] as ReportScopeKind;
      expect(preset.scopeKind).toBe(prefix);
    }
  });
});

describe('getPresetsForScope', () => {
  it('returns 4 presets for card scope', () => {
    expect(getPresetsForScope('card').map((p) => p.id)).toEqual([
      'card.overview',
      'card.activity',
      'card.checklist',
      'card.due-and-aging',
    ]);
  });

  it('returns 4 presets for list scope', () => {
    expect(getPresetsForScope('list')).toHaveLength(4);
  });

  it('returns 6 presets for board scope', () => {
    expect(getPresetsForScope('board')).toHaveLength(6);
  });

  it('returns 5 presets for workspace scope', () => {
    expect(getPresetsForScope('workspace')).toHaveLength(5);
  });
});

describe('getPresetById', () => {
  it('returns the manifest for a known id', () => {
    const p = getPresetById('board.health');
    expect(p?.scopeKind).toBe('board');
    expect(p?.microReportIds).toContain('board-health-score');
  });

  it('returns undefined for an unknown id', () => {
    expect(getPresetById('totally-fake-preset')).toBeUndefined();
  });
});

describe('preset cross-validation (preset × registry × scope)', () => {
  it('every micro-report referenced by a preset exists in the registry', () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      for (const microId of preset.microReportIds) {
        expect(
          MICRO_REPORTS[microId],
          `preset ${id} references unknown micro-report ${microId}`,
        ).toBeDefined();
      }
    }
  });

  it("every micro-report supports the preset's scope kind", () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      for (const microId of preset.microReportIds) {
        const manifest = MICRO_REPORTS[microId];
        expect(
          manifest?.supports.includes(preset.scopeKind),
          `preset ${id} (${preset.scopeKind}) uses micro-report ${microId} which only supports [${manifest?.supports.join(', ')}]`,
        ).toBe(true);
      }
    }
  });

  it('preset microReportIds are non-empty', () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      expect(preset.microReportIds.length).toBeGreaterThan(0);
    }
  });

  it('defaultFilters always include a range', () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      expect(preset.defaultFilters.range).toBeDefined();
    }
  });

  it('defaultComparison.mode is always previousPeriod (V1)', () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id] as PresetManifest;
      expect(preset.defaultComparison.mode).toBe('previousPeriod');
    }
  });
});
