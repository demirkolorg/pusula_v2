/**
 * Faz 13D — Rapor envelope tipi ve dataset render orchestrator
 * (DEM-260). Bir preset için tüm micro-report'ları sırayla çalıştırır,
 * sonuçları tek envelope'ta toplar (`error: {...}` ile widget-level fail
 * isolation; bkz. spec §16.5).
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.5 + §16.6 +
 * `docs/domain/09-raporlama-kurallari.md` §9.3-§9.4.
 */
import {
  computeDelta,
  getMicroReportById,
  getPresetById,
  resolveRange,
  runScopeAdapter,
  shiftRangeBack,
  type ComparisonConfig,
  type MicroReportSelection,
  type QueryCtx,
  type ReportFilters,
  type ReportScope,
  type RestrictedScope,
  type ScopeAdapter,
} from '@pusula/domain/reports';
import { computeRestrictedScope } from './compute-restricted-scope';

export interface ReportMicroResult {
  /** Micro-report id (registry key). */
  id: string;
  /** Veri payload'u (her micro-report kendi TData'sını döner). */
  data: unknown;
  /**
   * Comparison etkin ve micro-report `supportsComparison` ise previous
   * period datası. Null = comparison kapalı veya destek yok.
   */
  comparisonData: unknown | null;
  /** Tek widget fail ederse rapor düşmesin — error envelope'a yansır. */
  error: { code: string; message: string } | null;
}

export interface ReportEnvelope {
  scope: ReportScope;
  presetId: string;
  filters: ReportFilters;
  comparison: ComparisonConfig | null;
  /**
   * Faz 13M (DEM-269) — comparison etkinken backend'in hesapladığı
   * previous-period mutlak aralığı. UI `<PanelHeader>` "Önceki: …"
   * tooltip'inde gösterir. Comparison kapalıysa `null`.
   */
  comparisonRange: { from: string; to: string } | null;
  /** ISO timestamp — generated_at. */
  generatedAt: string;
  microReports: ReportMicroResult[];
  /**
   * Aggregation sırasında kullanıcının erişemediği alt entity'lerin
   * sayımı. Null = workspace admin / restricted etki yok. UI/PDF
   * `<RestrictedScopeBanner>` (13O) bu alanı kullanır.
   */
  restrictedScope: RestrictedScope | null;
}

/**
 * Bir micro-report id + scope için ScopeAdapter implementation'ını
 * çözen lookup. `@pusula/api/services/report-data/registry.ts` (aynı
 * dizinde) bu lookup'ın somut implementasyonunu sağlar.
 */
export type ScopeAdapterLookup = (microReportId: string) => ScopeAdapter<unknown> | undefined;

/**
 * Dataset orchestrator. Bir preset + filter + scope verince:
 *   1. Preset registry'den micro-report id listesini al,
 *   2. Override (`microReportOverrides`) varsa onunla evlendir (enabled
 *      flag'i ile widget kapatma),
 *   3. Her micro-report için ScopeAdapter çağır,
 *   4. Comparison etkinse `shiftRangeBack`'le previous period query,
 *   5. Sonuçları envelope'ta topla.
 */
export async function renderReportDataset(
  ctx: QueryCtx,
  lookup: ScopeAdapterLookup,
  input: {
    scope: ReportScope;
    presetId: string;
    filters: ReportFilters;
    comparison?: ComparisonConfig | null;
    microReportOverrides?: MicroReportSelection[];
  },
): Promise<ReportEnvelope> {
  const preset = getPresetById(input.presetId);
  if (!preset) {
    throw new Error(`renderReportDataset: unknown preset ${input.presetId}`);
  }

  // Comparison aktif (`enabled=true`) ise filter'ı previous-period
  // varyantına shift'le. `previousFilters` aynı filtre ama range geri
  // kaydırılmış; diğer alanlar (members/labels/scope) aynı. Envelope'a
  // `comparisonRange` mutlak [from, to] olarak yazılır — UI tooltip'i
  // ("Önceki: 2026-04-22 — 2026-05-22") bunu kullanır (Faz 13M / DEM-269).
  const comparisonOn = input.comparison?.enabled === true;
  let previousFilters: ReportFilters | null = null;
  let comparisonRange: { from: string; to: string } | null = null;
  if (comparisonOn) {
    const absolute = resolveRange(input.filters.range, ctx.now());
    const back = shiftRangeBack(absolute);
    const fromIso = back.from.toISOString();
    const toIso = back.to.toISOString();
    previousFilters = {
      ...input.filters,
      range: { kind: 'custom', from: fromIso, to: toIso },
    };
    comparisonRange = { from: fromIso, to: toIso };
  }

  // Override map: enabled=false ise widget atla; override varsa preset
  // sırasını koru ama default'tan farklı micro-report'lar ekleme (V1 —
  // composer UI yok; preset listesi kanonik).
  const enabledMap = new Map<string, boolean>();
  for (const sel of input.microReportOverrides ?? []) {
    enabledMap.set(sel.microReportId, sel.enabled);
  }

  const microResults: ReportMicroResult[] = [];

  for (const microId of preset.microReportIds) {
    // Override default = enabled; explicit false ise atla.
    if (enabledMap.get(microId) === false) {
      continue;
    }

    const manifest = getMicroReportById(microId);
    if (!manifest) {
      microResults.push({
        id: microId,
        data: null,
        comparisonData: null,
        error: { code: 'unknown_micro_report', message: `Registry'de ${microId} yok` },
      });
      continue;
    }

    const adapter = lookup(microId);
    if (!adapter) {
      microResults.push({
        id: microId,
        data: null,
        comparisonData: null,
        error: {
          code: 'adapter_not_implemented',
          message: `Query servisi henüz yok: ${microId} (13D ilk turunda 8 micro-report implementli; geri kalanı sonraki turlarda)`,
        },
      });
      continue;
    }

    if (!manifest.supports.includes(input.scope.kind)) {
      microResults.push({
        id: microId,
        data: null,
        comparisonData: null,
        error: {
          code: 'scope_not_supported',
          message: `${microId} ${input.scope.kind} scope'unu desteklemiyor`,
        },
      });
      continue;
    }

    // Ana query.
    let data: unknown = null;
    let comparisonData: unknown | null = null;
    let error: ReportMicroResult['error'] = null;
    try {
      data = await runScopeAdapter(adapter, ctx, input.scope, input.filters);

      // Comparison: previousFilters + adapter aynı şekilde çalıştırılır.
      if (comparisonOn && previousFilters && manifest.supportsComparison) {
        try {
          comparisonData = await runScopeAdapter(
            adapter,
            ctx,
            input.scope,
            previousFilters,
          );
        } catch (cmpErr) {
          // Comparison fail ise main veriyi koru, comparison'u null bırak.
          // Faz 13M code-review nit #2: silent drop görünmesin — main-query
          // catch ile simetrik server-side log (PII-safe stack); kullanıcı
          // ana veriyi görmeye devam eder (envelope'ta comparisonData null).
          comparisonData = null;
          console.warn('[report-envelope] comparison query failed', {
            microReportId: microId,
            scope: input.scope,
            presetId: input.presetId,
            error: cmpErr instanceof Error
              ? { message: cmpErr.message, stack: cmpErr.stack }
              : cmpErr,
          });
        }
      }
    } catch (err) {
      // Security: raw DB hata mesajı UI'a sızmamalı (schema/parametre/PII
      // leak riski — DEM-260 security review H2). Server-side log için
      // `console.warn`; client'a sabit i18n-key style mesaj döner.
      console.warn('[report-envelope] micro-report query failed', {
        microReportId: microId,
        scope: input.scope,
        presetId: input.presetId,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      });
      error = {
        code: 'query_failed',
        message: 'Bu rapor parçası şu anda yüklenemedi.',
      };
    }

    microResults.push({ id: microId, data, comparisonData, error });
  }

  // Faz 13O (DEM-271) — bilgi sızıntısı disipline §9.4: workspace scope'ta
  // member/guest için `total - accessible` farkı; admin için null. Board
  // scope V1'de list-level ACL yok → null (V2 hazır). List/Card → null.
  // `computeRestrictedScope` `ctx.permissions` cache'ini reuse eder (aynı
  // workspace zaten micro-report query'leri tarafından sorulmuştur).
  const restrictedScope = await computeRestrictedScope({ ctx, scope: input.scope });

  return {
    scope: input.scope,
    presetId: input.presetId,
    filters: input.filters,
    comparison: input.comparison ?? null,
    comparisonRange,
    generatedAt: ctx.now().toISOString(),
    microReports: microResults,
    restrictedScope,
  };
}

/**
 * `computeDelta` re-export'u — UI/printcomp.aynı saf fonksiyona erişir.
 * @pusula/domain/reports'tan da çağrılabilir; burada convenience.
 */
export { computeDelta };
