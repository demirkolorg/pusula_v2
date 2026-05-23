/**
 * Faz 13C — Micro-report data manifest registry (DEM-259). 30 micro-report
 * için meta + capability bilgisi. UI tarafı (`@pusula/ui/reports`) aynı
 * `id` ile component manifest'i tutar (split data/ui — bkz. §16.4 13C ADR).
 *
 * Spec: `docs/domain/09-raporlama-kurallari.md` §9.6 (kanonik tablo).
 *
 * **Bu registry framework-bağımsızdır** — React, Drizzle, tRPC bağımlılığı
 * YOK. Gerçek query implementasyonları `@pusula/api/services/report-data/*`
 * (13D), React component'leri `@pusula/ui/reports/*` (13F).
 */
import type { MicroReportCategory, ReportScopeKind } from './types';

export interface MicroReportDataManifest {
  /** Stable id — UI/API/Excel hepsi bunu kullanır. */
  id: string;
  /**
   * i18n key (`reports.microReports.<id>.title` + `.emptyState`). Sabit:
   * registry.ts'te tutulur; lookup `REPORT_I18N_KEYS.microReports[<id>]`
   * (camel-case'e dönüşmüş hâl) ile yapılır.
   */
  i18nKey: string;
  category: MicroReportCategory;
  /**
   * Hangi scope'larda çalışır (§9.2). Preset cross-validation'da
   * `presets.test.ts` her preset'in micro-report'unun bu listedeki bir
   * scope'u içerdiğini doğrular.
   */
  supports: ReadonlyArray<ReportScopeKind>;
  /** Panel grid layout default'u (UI tarafı override edebilir). */
  defaultLayout: {
    colSpan: 1 | 2 | 3 | 4;
    minHeight: number;
  };
  supportsComparison: boolean;
  supportsCsv: boolean;
  supportsPngExport: boolean;
  /** "Veri yok" empty state için i18n key. */
  emptyStateKey: string;
}

/** id'leri camelCase'e çevirip i18n key olarak basit dönüştürücü. */
function toI18nSegment(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function make(
  id: string,
  category: MicroReportCategory,
  supports: ReadonlyArray<ReportScopeKind>,
  defaultLayout: MicroReportDataManifest['defaultLayout'],
  flags: { comparison: boolean; csv: boolean; png: boolean },
): MicroReportDataManifest {
  const segment = toI18nSegment(id);
  return {
    id,
    i18nKey: `reports.microReports.${segment}.title`,
    category,
    supports,
    defaultLayout,
    supportsComparison: flags.comparison,
    supportsCsv: flags.csv,
    supportsPngExport: flags.png,
    emptyStateKey: `reports.microReports.${segment}.emptyState`,
  };
}

// ─── 30 micro-report (§9.6 tablo) ──────────────────────────────────────────
//
// C = card, L = list, B = board, W = workspace.
// defaultLayout colSpan, supports, comparison/csv/png bayrakları §9.6'dan.

const MICRO_REPORTS_LIST: ReadonlyArray<MicroReportDataManifest> = [
  // Aktivite & Üye (6)
  make(
    'activity-timeline',
    'activity',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 4, minHeight: 320 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'activity-heatmap',
    'activity',
    ['list', 'board', 'workspace'],
    { colSpan: 4, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'activity-breakdown',
    'activity',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'member-contribution',
    'activity',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 320 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'member-workload',
    'activity',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 320 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'member-presence',
    'activity',
    ['board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: false, csv: true, png: false },
  ),

  // Durum & İlerleme (5)
  make(
    'status-breakdown',
    'status',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'checklist-progress',
    'status',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'completion-rate',
    'status',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'burndown',
    'status',
    ['board', 'workspace'],
    { colSpan: 3, minHeight: 320 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'description-coverage',
    'status',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: true },
  ),

  // Zaman & Vade (5)
  make(
    'due-date-overview',
    'time',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'aging-report',
    'time',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'cycle-time',
    'time',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'time-in-list',
    'time',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'due-trend',
    'time',
    ['board', 'workspace'],
    { colSpan: 3, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),

  // Yapı & İçerik (14)
  make(
    'label-distribution',
    'structure',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'label-trend',
    'structure',
    ['board', 'workspace'],
    { colSpan: 3, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'comment-volume',
    'structure',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'attachment-summary',
    'structure',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'list-flow',
    'structure',
    ['board', 'workspace'],
    { colSpan: 4, minHeight: 320 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'wip-count',
    'structure',
    ['board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'board-health-score',
    'structure',
    ['board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: true, csv: true, png: false },
  ),
  // Entity-summary: tek scope detayı (Tiptap dahil — §9.13); CSV/PNG export anlamsız.
  make(
    'entity-summary',
    'structure',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 4, minHeight: 240 },
    { comparison: false, csv: false, png: false },
  ),
  // KPI: tek sayı + delta (comparison destekler ama export anlamsız).
  make(
    'kpi-card',
    'structure',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 1, minHeight: 140 },
    { comparison: true, csv: false, png: false },
  ),
  make(
    'recent-changes',
    'structure',
    ['card', 'list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 320 },
    { comparison: false, csv: true, png: false },
  ),
  make(
    'mention-graph',
    'structure',
    ['board', 'workspace'],
    { colSpan: 3, minHeight: 320 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'label-cooccurrence',
    'structure',
    ['board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: false, csv: true, png: true },
  ),
  make(
    'list-balance',
    'structure',
    ['board', 'workspace'],
    { colSpan: 2, minHeight: 280 },
    { comparison: true, csv: true, png: true },
  ),
  make(
    'attachment-type-breakdown',
    'structure',
    ['list', 'board', 'workspace'],
    { colSpan: 2, minHeight: 240 },
    { comparison: false, csv: true, png: true },
  ),
];

/** Id → manifest (constant-time lookup). */
export const MICRO_REPORTS: Readonly<Record<string, MicroReportDataManifest>> = Object.freeze(
  Object.fromEntries(MICRO_REPORTS_LIST.map((m) => [m.id, m])),
);

/** Tüm 30 micro-report id'sinin sıralı listesi (registry order). */
export const MICRO_REPORT_IDS: ReadonlyArray<string> = MICRO_REPORTS_LIST.map((m) => m.id);

/** Id'den manifest bul (yoksa undefined). */
export function getMicroReportById(id: string): MicroReportDataManifest | undefined {
  return MICRO_REPORTS[id];
}

/**
 * Bir scope kind'da çalışabilen tüm micro-report'ları döner — UI catalog
 * (composer panelinde "kullanılabilir micro-reports" listesi) bunu kullanır.
 */
export function getMicroReportsForScope(
  scopeKind: ReportScopeKind,
): ReadonlyArray<MicroReportDataManifest> {
  return MICRO_REPORTS_LIST.filter((m) => m.supports.includes(scopeKind));
}
