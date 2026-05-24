/**
 * Faz 13L (DEM-268) — Excel (xlsx) render pipeline'ı. `exceljs` ile
 * multi-sheet workbook: metadata sheet + her micro-report ayrı sheet.
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9.
 *
 * Pipeline (worker `processReportRenderJob` xlsx branch'inden çağrılır):
 *   1. `print.requestToken` (PDF pipeline'ı ile aynı helper)
 *   2. `print.verifyToken` (yeni dataset resolver) → envelope + i18n
 *   3. `renderXlsx({ envelope, i18n, ... })` → Buffer
 *   4. MinIO upload + DB transaction (`markRenderCompleted` reuse)
 *
 * Puppeteer **YOK** — saf Node-side render; bellekte hızlı + Chromium
 * paralel job ile yarışmaz (concurrency=2 limiti xlsx için geçersiz).
 *
 * `worksheetExport` opsiyonel manifest metodudur: yoksa o micro-report
 * sheet'e dönüşmez (sadece metadata'da rapor edilir). Her sheet kendi
 * `numFmt` ile sayı/tarih formatı atayabilir.
 */
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';

/**
 * Faz 13L (DEM-268) — `worksheetExport` sözleşmesi (`@pusula/ui/reports`
 * `MicroReportUiManifest.worksheetExport`). Worker `@pusula/ui` paketine
 * TypeScript-level JSX deps almak istemez; bu yüzden render-xlsx
 * dependency-injection ile manifest lookup'ını alır. Production
 * `apps/worker/src/index.ts`'te `MICRO_REPORT_COMPONENTS` üzerinden;
 * testlerde mock fixture.
 */
export interface WorksheetExportResult {
  columns: ReadonlyArray<{
    header: string;
    key: string;
    width?: number;
    numFmt?: string;
  }>;
  rows: ReadonlyArray<Record<string, unknown>>;
}
export type WorksheetExporter = (data: unknown) => WorksheetExportResult;
export type WorksheetExporterLookup = (microReportId: string) =>
  | WorksheetExporter
  | undefined;

/** Excel input — `print.verifyToken` payload'undan türetilir. */
export interface RenderXlsxInput {
  envelope: ReportEnvelope;
  /** Server-side i18n stub map (`reports.*` Türkçe karşılıkları). */
  i18n: Record<string, string>;
  /** Workspace adı (metadata sheet için). */
  workspaceName: string;
  /** Locale — `tr-TR` V1; tarih/sayı formatı için. */
  locale: string;
  /** Saved report başlığı (yoksa preset i18n veya presetId fallback). */
  title?: string;
  /** Üretim tarihini override etmek için (test deterministic). */
  now?: () => Date;
  /**
   * Manifest lookup — UI registry'sinden worksheetExport çekici. Worker
   * production'da `apps/worker/src/index.ts`'te `MICRO_REPORT_COMPONENTS`
   * üzerinden sağlanır.
   */
  getWorksheetExporter: WorksheetExporterLookup;
}

export interface RenderXlsxResult {
  buffer: Buffer;
  byteSize: number;
  checksum: string;
  sheetCount: number;
}

/** Excel sheet adı limit'leri. */
const SHEET_NAME_MAX = 31;
const INVALID_SHEET_CHARS = /[*?:[\]/\\]/g;

/** Pusula brand mavisi (theme.css `--primary` lookup'i sunucuda yok — sabit). */
const HEADER_FILL_ARGB = 'FF1976D2';

/**
 * Sheet adını Excel sınırlarına uydur: özel karakterleri `_` yap, 31 char
 * crop. Boş kalırsa 'Sheet' fallback.
 */
export function sanitizeSheetName(raw: string): string {
  const cleaned = raw.replace(INVALID_SHEET_CHARS, '_').trim();
  if (cleaned.length === 0) return 'Sheet';
  return cleaned.slice(0, SHEET_NAME_MAX);
}

/**
 * Aynı sheet adı çakışırsa ` (2)`, ` (3)` suffix ekle; base 31'i aşıyorsa
 * suffix'e yer açacak şekilde crop et.
 */
export function uniqueSheetName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (true) {
    const suffixStr = ` (${suffix})`;
    const baseSlice = base.slice(0, Math.max(1, SHEET_NAME_MAX - suffixStr.length));
    const candidate = `${baseSlice}${suffixStr}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    suffix++;
  }
}

function kebabToCamel(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * `reports.microReports.<camelCaseId>.title` i18n key'ine bak; yoksa id'yi
 * sheet adı olarak kullan. 13Q i18n provider gelene kadar `i18n` payload
 * Türkçe stub'ı barındırır.
 */
export function resolveMicroReportTitle(
  microReportId: string,
  i18n: Record<string, string>,
): string {
  const segment = kebabToCamel(microReportId);
  return i18n[`reports.microReports.${segment}.title`] ?? microReportId;
}

/**
 * Scope kind'ı human-readable label'a çevir (metadata sheet için).
 */
function formatScopeLabel(
  scope: ReportEnvelope['scope'],
  i18n: Record<string, string>,
): string {
  const label = i18n[`reports.scope.${scope.kind}`] ?? scope.kind;
  const id =
    scope.kind === 'card'
      ? scope.cardId
      : scope.kind === 'list'
        ? scope.listId
        : scope.kind === 'board'
          ? scope.boardId
          : scope.workspaceId;
  return `${label} (${id})`;
}

/**
 * Metadata sheet ekle: rapor başlığı, workspace, scope, filtre özeti,
 * üretim tarihi, restricted scope uyarısı. Başlık satırı bold + Pusula
 * mavisi (Excel branding).
 */
function addMetadataSheet(args: {
  workbook: ExcelJS.Workbook;
  envelope: ReportEnvelope;
  i18n: Record<string, string>;
  workspaceName: string;
  title: string;
  generatedAt: string;
}): void {
  const sheet = args.workbook.addWorksheet('Özet');
  sheet.columns = [
    { header: 'Alan', key: 'field', width: 28 },
    { header: 'Değer', key: 'value', width: 60 },
  ];
  sheet.addRows([
    { field: 'Rapor Başlığı', value: args.title },
    { field: 'Workspace', value: args.workspaceName || '—' },
    { field: 'Kapsam', value: formatScopeLabel(args.envelope.scope, args.i18n) },
    { field: 'Preset', value: args.envelope.presetId },
    { field: 'Filtre', value: JSON.stringify(args.envelope.filters) },
    {
      field: 'Karşılaştırma',
      value: args.envelope.comparison?.enabled ? 'Açık' : 'Kapalı',
    },
    { field: 'Üretim Tarihi', value: args.generatedAt },
  ]);
  if (args.envelope.restrictedScope) {
    const r = args.envelope.restrictedScope;
    sheet.addRow({
      field: 'Kısıtlı görünüm',
      value: `${r.excludedCount} ${r.excludedKind} görünürlüğünüz dışında`,
    });
  }
  // Header satırını stylele.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL_ARGB },
  };
  headerRow.alignment = { vertical: 'middle' };
}

/**
 * Tek micro-report sheet'i ekler. Manifest `worksheetExport` yoksa
 * `null` döner (caller skip eder). Sayı format'ı (numFmt) varsa o
 * column'a uygulanır.
 */
function addMicroReportSheet(args: {
  workbook: ExcelJS.Workbook;
  microReportId: string;
  data: unknown;
  sheetName: string;
  comparisonNote?: string;
  getWorksheetExporter: WorksheetExporterLookup;
}): boolean {
  const exporter = args.getWorksheetExporter(args.microReportId);
  if (!exporter) return false;
  const { columns, rows } = exporter(args.data);
  if (columns.length === 0) return false;

  const sheet = args.workbook.addWorksheet(args.sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 16,
  }));
  // exceljs `column.numFmt` header satırı eklendikten sonra atanır.
  columns.forEach((c, idx) => {
    if (c.numFmt) {
      sheet.getColumn(idx + 1).numFmt = c.numFmt;
    }
  });
  // Mutable kopya — exceljs `addRows` readonly array kabul etmez.
  sheet.addRows(rows.map((r) => ({ ...r })));
  if (args.comparisonNote) {
    sheet.addRow([]);
    sheet.addRow(['#', args.comparisonNote]);
  }
  // Header styling
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL_ARGB },
  };
  return true;
}

export async function renderXlsx(input: RenderXlsxInput): Promise<RenderXlsxResult> {
  const now = input.now ?? (() => new Date());
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pusula';
  workbook.created = now();
  const presetTitle =
    input.i18n[`reports.presets.${input.envelope.presetId}.title`] ?? input.envelope.presetId;
  const title = input.title ?? presetTitle;
  workbook.title = title;

  // 1. Metadata sheet
  addMetadataSheet({
    workbook,
    envelope: input.envelope,
    i18n: input.i18n,
    workspaceName: input.workspaceName,
    title,
    generatedAt: input.envelope.generatedAt,
  });

  // 2. Her micro-report için sheet
  const usedNames = new Set<string>(['Özet']);
  let microSheetCount = 0;
  for (const mr of input.envelope.microReports) {
    if (mr.error) continue;
    const rawTitle = resolveMicroReportTitle(mr.id, input.i18n);
    const sheetName = uniqueSheetName(sanitizeSheetName(rawTitle), usedNames);
    const added = addMicroReportSheet({
      workbook,
      microReportId: mr.id,
      data: mr.data,
      sheetName,
      comparisonNote: mr.comparisonData
        ? input.i18n['reports.kpi.previousLabel'] ?? 'Önceki dönem:'
        : undefined,
      getWorksheetExporter: input.getWorksheetExporter,
    });
    if (!added) {
      // Manifest yoksa veya worksheetExport tanımsızsa → sheet adını
      // serbest bırak (başka micro-report alır).
      usedNames.delete(sheetName);
      continue;
    }
    microSheetCount++;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    byteSize: buffer.byteLength,
    checksum,
    sheetCount: microSheetCount + 1, // metadata + micro-report'lar
  };
}
