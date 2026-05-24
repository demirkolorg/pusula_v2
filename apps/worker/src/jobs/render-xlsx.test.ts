/**
 * Faz 13L (DEM-268) — render-xlsx unit tests. exceljs gerçek workbook
 * üretir; sheet sayımı + adlandırma + metadata stil + manifest yoksa
 * skip davranışı test edilir.
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import {
  renderXlsx,
  resolveMicroReportTitle,
  sanitizeSheetName,
  uniqueSheetName,
  type WorksheetExporter,
  type WorksheetExporterLookup,
} from './render-xlsx';

const I18N: Record<string, string> = {
  'reports.scope.board': 'Pano',
  'reports.microReports.activityTimeline.title': 'Etkinlik Zaman Çizelgesi',
  'reports.microReports.statusBreakdown.title': 'Durum Dağılımı',
  'reports.presets.board.health.title': 'Pano Sağlık',
  'reports.kpi.previousLabel': 'Önceki:',
};

function makeEnvelope(
  microReports: ReportEnvelope['microReports'],
  overrides: Partial<ReportEnvelope> = {},
): ReportEnvelope {
  return {
    generatedAt: '2026-05-24T12:00:00.000Z',
    scope: { kind: 'board', workspaceId: 'w1', boardId: 'b1' },
    presetId: 'board.health',
    filters: { range: { kind: 'preset', preset: 'last30d' } },
    microReports,
    restrictedScope: null,
    comparison: null,
    comparisonRange: null,
    ...overrides,
  } as ReportEnvelope;
}

function makeExporter(
  table: Record<string, ReturnType<WorksheetExporter>>,
): WorksheetExporterLookup {
  return (id) => {
    const out = table[id];
    if (!out) return undefined;
    return () => out;
  };
}

describe('sanitizeSheetName', () => {
  it('keeps simple names unchanged', () => {
    expect(sanitizeSheetName('Aktivite')).toBe('Aktivite');
  });
  it('replaces invalid characters', () => {
    expect(sanitizeSheetName('Foo/Bar:Baz')).toBe('Foo_Bar_Baz');
  });
  it('crops to 31 characters', () => {
    expect(sanitizeSheetName('A'.repeat(50)).length).toBe(31);
  });
  it('returns fallback for empty string', () => {
    expect(sanitizeSheetName('  ')).toBe('Sheet');
  });
});

describe('uniqueSheetName', () => {
  it('returns base when unused', () => {
    const used = new Set<string>();
    expect(uniqueSheetName('Foo', used)).toBe('Foo');
    expect(used.has('Foo')).toBe(true);
  });
  it('appends suffix on collision', () => {
    const used = new Set(['Foo']);
    expect(uniqueSheetName('Foo', used)).toBe('Foo (2)');
  });
  it('keeps total length ≤ 31 with suffix', () => {
    const base = 'A'.repeat(31);
    const used = new Set([base]);
    const result = uniqueSheetName(base, used);
    expect(result.length).toBeLessThanOrEqual(31);
    expect(result.endsWith(' (2)')).toBe(true);
  });
});

describe('resolveMicroReportTitle', () => {
  it('uses i18n title when found', () => {
    expect(resolveMicroReportTitle('activity-timeline', I18N)).toBe(
      'Etkinlik Zaman Çizelgesi',
    );
  });
  it('falls back to id when i18n missing', () => {
    expect(resolveMicroReportTitle('unknown-report', I18N)).toBe('unknown-report');
  });
});

describe('renderXlsx', () => {
  it('produces workbook with metadata sheet + micro-report sheets', async () => {
    const envelope = makeEnvelope([
      { id: 'activity-timeline', data: { events: [] }, comparisonData: null, error: null },
      { id: 'status-breakdown', data: { open: 1, completed: 2, archived: 0 }, comparisonData: null, error: null },
    ] as unknown as ReportEnvelope['microReports']);
    const exporter = makeExporter({
      'activity-timeline': {
        columns: [
          { header: 'Tarih', key: 'createdAt', width: 20 },
          { header: 'Tip', key: 'type' },
        ],
        rows: [
          { createdAt: '2026-05-01', type: 'card.created' },
          { createdAt: '2026-05-02', type: 'card.moved' },
        ],
      },
      'status-breakdown': {
        columns: [
          { header: 'Durum', key: 'metric' },
          { header: 'Adet', key: 'value', numFmt: '#,##0' },
        ],
        rows: [
          { metric: 'open', value: 1 },
          { metric: 'completed', value: 2 },
        ],
      },
    });
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sheetCount).toBe(3); // metadata + 2 micro
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);

    // Yeni workbook ile yeniden yükleyip doğrula.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as never);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Özet',
      'Etkinlik Zaman Çizelgesi',
      'Durum Dağılımı',
    ]);
  });

  it('skips micro-report when manifest worksheetExport missing', async () => {
    const envelope = makeEnvelope([
      { id: 'activity-timeline', data: {}, comparisonData: null, error: null },
      { id: 'kpi-card', data: {}, comparisonData: null, error: null },
    ] as unknown as ReportEnvelope['microReports']);
    const exporter = makeExporter({
      'activity-timeline': {
        columns: [{ header: 'Foo', key: 'foo' }],
        rows: [{ foo: 1 }],
      },
      // kpi-card export yok → skip
    });
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    expect(result.sheetCount).toBe(2); // metadata + activity-timeline (kpi-card skip)
  });

  it('skips error-state micro-reports', async () => {
    const envelope = makeEnvelope([
      {
        id: 'activity-timeline',
        data: null,
        comparisonData: null,
        error: { code: 'adapter_failed', message: 'oops' },
      },
    ] as unknown as ReportEnvelope['microReports']);
    const exporter = makeExporter({
      'activity-timeline': {
        columns: [{ header: 'X', key: 'x' }],
        rows: [{ x: 1 }],
      },
    });
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    expect(result.sheetCount).toBe(1); // sadece metadata
  });

  it('disambiguates same i18n title via suffix', async () => {
    const envelope = makeEnvelope([
      { id: 'a', data: {}, comparisonData: null, error: null },
      { id: 'b', data: {}, comparisonData: null, error: null },
    ] as unknown as ReportEnvelope['microReports']);
    // Hem a hem b aynı title döner — sheet adı çakışır.
    const i18nDupe = { ...I18N, 'reports.microReports.a.title': 'Aynı', 'reports.microReports.b.title': 'Aynı' };
    const exporter = makeExporter({
      a: { columns: [{ header: 'X', key: 'x' }], rows: [] },
      b: { columns: [{ header: 'Y', key: 'y' }], rows: [] },
    });
    const result = await renderXlsx({
      envelope,
      i18n: i18nDupe,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as never);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Özet', 'Aynı', 'Aynı (2)']);
  });

  it('applies numFmt to columns when provided', async () => {
    const envelope = makeEnvelope([
      { id: 'status-breakdown', data: {}, comparisonData: null, error: null },
    ] as unknown as ReportEnvelope['microReports']);
    const exporter = makeExporter({
      'status-breakdown': {
        columns: [
          { header: 'Metric', key: 'metric' },
          { header: 'Value', key: 'value', numFmt: '#,##0.00' },
        ],
        rows: [{ metric: 'x', value: 12345.67 }],
      },
    });
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as never);
    const sheet = wb.worksheets.find((s) => s.name === 'Durum Dağılımı');
    expect(sheet?.getColumn(2).numFmt).toBe('#,##0.00');
  });

  it('writes restricted scope row to metadata when set', async () => {
    const envelope = makeEnvelope(
      [
        { id: 'activity-timeline', data: {}, comparisonData: null, error: null },
      ] as unknown as ReportEnvelope['microReports'],
      {
        restrictedScope: { excludedKind: 'list', excludedCount: 3 },
      } as Partial<ReportEnvelope>,
    );
    const exporter = makeExporter({
      'activity-timeline': {
        columns: [{ header: 'X', key: 'x' }],
        rows: [],
      },
    });
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as never);
    const meta = wb.worksheets.find((s) => s.name === 'Özet');
    // Sayfaki tüm satırların value'larını dump et — restricted scope satırı içermeli.
    const allCells: string[] = [];
    meta?.eachRow((row) => {
      row.eachCell((cell) => allCells.push(String(cell.value ?? '')));
    });
    expect(allCells.some((v) => v.includes('Kısıtlı görünüm'))).toBe(true);
    expect(allCells.some((v) => v.includes('3 list'))).toBe(true);
  });

  it('produces zero-microreport workbook with only metadata', async () => {
    const envelope = makeEnvelope([]);
    const exporter = makeExporter({});
    const result = await renderXlsx({
      envelope,
      i18n: I18N,
      workspaceName: 'Acme',
      locale: 'tr-TR',
      getWorksheetExporter: exporter,
    });
    expect(result.sheetCount).toBe(1);
    expect(result.byteSize).toBeGreaterThan(0);
  });
});
