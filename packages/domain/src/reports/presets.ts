/**
 * Faz 13C — Preset şablon registry (DEM-259). 19 preset, her biri belli
 * bir scope için sabit micro-report kombinasyonu + default filtre +
 * comparison ayarı taşır.
 *
 * Spec: `docs/domain/09-raporlama-kurallari.md` §9.7 (kanonik tablo).
 *
 * `__tests__/presets.test.ts` cross-validation: her preset'in
 * `microReportIds` listesi registry'de mevcut + manifest'in `supports`
 * alanı preset'in `scopeKind`'ini içerir (preset bozuk olamaz).
 */
import type { ComparisonConfig, ReportFilters, ReportScopeKind } from './types';

export interface PresetManifest {
  /** Stable id (`<scope>.<name>`), örn. `board.health`. */
  id: string;
  /** i18n key (`reports.presets.<segment>.title|description`). */
  i18nKey: string;
  scopeKind: ReportScopeKind;
  /**
   * Preset'in default micro-report listesi (sıralı). Kullanıcı composer'da
   * toggle ile bireysel olarak açıp kapatabilir; o override
   * `MicroReportSelection[]`'da taşınır (preset listesi sabit kalır).
   */
  microReportIds: ReadonlyArray<string>;
  /** Preset'in açıldığı anda formun başlangıç filtreleri. */
  defaultFilters: ReportFilters;
  /** Comparison toggle'ın başlangıç durumu. */
  defaultComparison: ComparisonConfig;
}

// ─── Sabit filtre/comparison parçaları ─────────────────────────────────────

/** Tüm preset'ler için ortak ad-hoc default: son 30 gün + open+completed. */
const DEFAULT_FILTERS: ReportFilters = Object.freeze({
  range: { kind: 'preset', preset: 'last30d' },
  scopeFilter: {
    includeArchivedLists: false,
    cardStatus: ['open', 'completed'],
  },
}) as ReportFilters;

/** Default comparison: kapalı (kullanıcı toggle eder). */
const COMPARISON_OFF: ComparisonConfig = Object.freeze({
  enabled: false,
  mode: 'previousPeriod',
});

/** Sprint/burndown gibi trend-merkezli preset'ler için comparison açık. */
const COMPARISON_ON: ComparisonConfig = Object.freeze({
  enabled: true,
  mode: 'previousPeriod',
});

function toI18nSegment(id: string): string {
  // `board.health` → `boardHealth` (presets.ts segment formatı).
  return id.replace(/[.-]([a-z])/g, (_, c: string) => c.toUpperCase());
}

function preset(
  id: string,
  scopeKind: ReportScopeKind,
  microReportIds: ReadonlyArray<string>,
  options?: {
    comparison?: ComparisonConfig;
    filters?: ReportFilters;
  },
): PresetManifest {
  return {
    id,
    i18nKey: `reports.presets.${toI18nSegment(id)}.title`,
    scopeKind,
    microReportIds,
    defaultFilters: options?.filters ?? DEFAULT_FILTERS,
    defaultComparison: options?.comparison ?? COMPARISON_OFF,
  };
}

// ─── 19 preset (§9.7 tablo) ────────────────────────────────────────────────

const PRESETS_LIST: ReadonlyArray<PresetManifest> = [
  // Card (4)
  preset('card.overview', 'card', [
    'entity-summary',
    'kpi-card',
    'checklist-progress',
    'due-date-overview',
    'recent-changes',
  ]),
  preset('card.activity', 'card', [
    'activity-timeline',
    'activity-breakdown',
    'comment-volume',
    'attachment-summary',
  ]),
  preset('card.checklist', 'card', ['checklist-progress', 'kpi-card', 'recent-changes']),
  preset('card.due-and-aging', 'card', [
    'due-date-overview',
    'time-in-list',
    // `aging-report` card scope'unda DESTEKLENMEZ (§9.6 — L/B/W); preset
    // adlandırması "& aging" olsa da card seviyesinde `time-in-list` yaşlanma
    // sinyalini sağlar. Cross-validation testi bunu doğrular.
  ]),

  // List (4)
  // `list.wip-and-health` §9.7'de `wip-count` listeler ama §9.6 matrisine
  // göre `wip-count` board+workspace only. Yapısal kanonik §9.6 — list
  // seviyesinde WIP sinyali `status-breakdown` + `kpi-card` ile karşılanır.
  preset('list.wip-and-health', 'list', [
    'status-breakdown',
    'kpi-card',
    'aging-report',
  ]),
  preset('list.member-workload', 'list', [
    'member-workload',
    'member-contribution',
    'activity-breakdown',
  ]),
  preset('list.due-overview', 'list', ['due-date-overview', 'time-in-list', 'aging-report']),
  preset('list.activity', 'list', ['activity-timeline', 'activity-heatmap', 'comment-volume']),

  // Board (6)
  preset(
    'board.health',
    'board',
    [
      'board-health-score',
      'kpi-card',
      'status-breakdown',
      'aging-report',
      'due-date-overview',
    ],
    { comparison: COMPARISON_OFF },
  ),
  preset(
    'board.sprint-summary',
    'board',
    ['burndown', 'completion-rate', 'member-contribution', 'due-trend'],
    { comparison: COMPARISON_ON },
  ),
  preset('board.member-performance', 'board', [
    'member-contribution',
    'member-workload',
    'activity-breakdown',
    'member-presence',
  ]),
  preset('board.due-and-risk', 'board', [
    'due-date-overview',
    'aging-report',
    'due-trend',
    'cycle-time',
  ]),
  preset('board.flow', 'board', ['list-flow', 'list-balance', 'cycle-time', 'wip-count']),
  preset('board.label-distribution', 'board', [
    'label-distribution',
    'label-trend',
    'label-cooccurrence',
  ]),

  // Workspace (5)
  preset('workspace.executive-summary', 'workspace', [
    'kpi-card',
    'status-breakdown',
    'completion-rate',
    'due-trend',
  ]),
  // Pano karşılaştırma preset'i §9.7'de "per-board mini KPI grid (özel widget)"
  // diye geçer — 13F UI'da custom kompozit widget; domain registry'sinde
  // mevcut micro-report'larla en yakın kombinasyon: workspace-level
  // board-health-score + activity-breakdown.
  preset('workspace.board-comparison', 'workspace', [
    'board-health-score',
    'activity-breakdown',
  ]),
  preset('workspace.team-performance', 'workspace', [
    'member-contribution',
    'member-workload',
    'member-presence',
    'activity-heatmap',
  ]),
  preset('workspace.due-and-risk', 'workspace', [
    'due-date-overview',
    'aging-report',
    'due-trend',
  ]),
  preset('workspace.activity-heatmap', 'workspace', [
    'activity-heatmap',
    'activity-breakdown',
    'mention-graph',
  ]),
];

/** Id → manifest (constant-time lookup). */
export const PRESETS: Readonly<Record<string, PresetManifest>> = Object.freeze(
  Object.fromEntries(PRESETS_LIST.map((p) => [p.id, p])),
);

/** Tüm preset'lerin sıralı listesi (catalog order). */
export const PRESET_IDS: ReadonlyArray<string> = PRESETS_LIST.map((p) => p.id);

export function getPresetById(id: string): PresetManifest | undefined {
  return PRESETS[id];
}

export function getPresetsForScope(scopeKind: ReportScopeKind): ReadonlyArray<PresetManifest> {
  return PRESETS_LIST.filter((p) => p.scopeKind === scopeKind);
}
