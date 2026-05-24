/**
 * Faz 13L (DEM-268) — `worksheetExport` sözleşme testi. Her micro-report
 * manifest'inin (eğer worksheetExport tanımladıysa) çıktısı şu invariant'ları
 * sağlamalı:
 *   - columns array, her column `header` + `key` string'i
 *   - rows readonly array, her row Record<string, unknown>
 *   - boş data ile çağrıldığında { columns: [...], rows: [] } veya minimum
 *     bir row (entity-summary gibi tek-row case için).
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9.
 */
import { describe, expect, it } from 'vitest';
import { MICRO_REPORTS } from '@pusula/domain/reports';
import { MICRO_REPORT_COMPONENTS } from '../registry';

/**
 * Her micro-report için stub data — manifest'ler kendi data shape'lerini
 * import etmediği için worksheetExport çağrısı `data: unknown` kabul eder.
 * Bu testte tip uyumluluğu önemli değil (Component zaten ayrı test'lere
 * sahip); odak `worksheetExport` çağrısının patlamamasi + invariant'lar.
 */
const STUB_DATA: Record<string, unknown> = {
  'activity-timeline': { events: [], totalCount: 0 },
  'activity-heatmap': { cells: [], maxCount: 0, totalCount: 0 },
  'activity-breakdown': { items: [], otherCount: 0, totalCount: 0 },
  'aging-report': { buckets: [], oldest: [], totalCards: 0 },
  'attachment-summary': {
    totalCount: 0,
    totalBytes: 0,
    byType: { image: 0, pdf: 0, office: 0, other: 0 },
  },
  'attachment-type-breakdown': { items: [] },
  'board-health-score': {
    score: 0,
    components: { avgAgeDays: 0, wipOverload: 0, stalePercentage: 0, overduePercentage: 0 },
  },
  burndown: { totalCards: 0, buckets: [] },
  'checklist-progress': { total: 0, completed: 0, percentage: null },
  'comment-volume': { totalCount: 0, buckets: [] },
  'completion-rate': { totalCompleted: 0, averagePerDay: 0, buckets: [] },
  'cycle-time': {
    totalSamples: 0,
    p50Hours: null,
    p75Hours: null,
    p95Hours: null,
    averageHours: null,
    buckets: [],
  },
  'description-coverage': { total: 0, withDescription: 0, percentage: null },
  'due-date-overview': { buckets: [], totalCards: 0 },
  'due-trend': { totalUpcoming: 0, buckets: [] },
  'entity-summary': { headline: '', meta: {} },
  'kpi-card': { items: [] },
  'label-cooccurrence': { pairs: [] },
  'label-distribution': { labels: [] },
  'label-trend': { series: [] },
  'list-balance': { items: [], average: 0, standardDeviation: 0, balanced: true },
  'list-flow': { edges: [], totalMoves: 0 },
  'member-contribution': { contributors: [] },
  'member-presence': { items: [] },
  'member-workload': { items: [] },
  'mention-graph': { edges: [] },
  'recent-changes': { events: [] },
  'status-breakdown': { open: 0, completed: 0, archived: 0, total: 0 },
  'time-in-list': { items: [] },
  'wip-count': { items: [], totalOpen: 0 },
};

describe('worksheetExport contract (13L)', () => {
  it('every UI manifest with worksheetExport returns sane shape', () => {
    let checked = 0;
    for (const id of Object.keys(MICRO_REPORT_COMPONENTS)) {
      const manifest = MICRO_REPORT_COMPONENTS[id]!;
      if (!manifest.worksheetExport) continue;
      const data = STUB_DATA[id] ?? {};
      const out = manifest.worksheetExport(data);
      expect(Array.isArray(out.columns), `${id} columns must be array`).toBe(true);
      expect(out.columns.length, `${id} columns must be non-empty`).toBeGreaterThan(0);
      for (const col of out.columns) {
        expect(typeof col.header, `${id} column.header`).toBe('string');
        expect(typeof col.key, `${id} column.key`).toBe('string');
        if (col.width !== undefined) {
          expect(typeof col.width).toBe('number');
        }
        if (col.numFmt !== undefined) {
          expect(typeof col.numFmt).toBe('string');
        }
      }
      expect(Array.isArray(out.rows), `${id} rows must be array`).toBe(true);
      // rows boş olabilir (boş data); ama her satır object olmalı
      for (const row of out.rows) {
        expect(typeof row, `${id} row must be object`).toBe('object');
      }
      checked++;
    }
    expect(checked, 'at least 8 manifest worksheetExport defined').toBeGreaterThanOrEqual(8);
  });

  it('domain `supportsCsv: true` micro-reports have worksheetExport', () => {
    const skipped: string[] = [];
    for (const id of Object.keys(MICRO_REPORTS)) {
      const manifest = MICRO_REPORTS[id]!;
      if (!manifest.supportsCsv) continue;
      const ui = MICRO_REPORT_COMPONENTS[id];
      if (!ui) continue;
      if (!ui.worksheetExport) {
        skipped.push(id);
      }
    }
    expect(skipped, `CSV-supported micro-reports without worksheetExport: ${skipped.join(', ')}`).toEqual([]);
  });
});
