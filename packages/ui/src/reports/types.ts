import type { ComponentType } from 'react';
import type {
  ComparisonConfig,
  DeltaResult,
  ReportFilters,
  ReportScope,
  RestrictedScope,
} from '@pusula/domain/reports';

/**
 * Faz 13F — UI-side micro-report contract (DEM-262). Domain (`@pusula/domain/reports`)
 * data manifest + UI manifest split kararı (13C ADR 2026-05-23) gereği
 * `Component` / `PrintComponent` / `worksheetExport` burada yaşar; veri
 * `MicroReportDataManifest` ile id üzerinden eşlenir.
 *
 * `t` ve `locale` UI'ya prop olarak inject edilir — paket next-intl/i18next
 * gibi spesifik kütüphaneye bağlanmaz; `apps/web` wrapper'ı sağlar.
 */
export interface MicroReportProps<TData> {
  /** Veri payload — adapter return shape'i ile birebir. */
  data: TData;
  /** Comparison etkin ve adapter destekliyor ise previous period datası. */
  comparisonData?: TData | null;
  /** Render scope (card/list/board/workspace). */
  scope: ReportScope;
  /** Filtre snapshot'ı (UI'da filter chip'leri için). */
  filters: ReportFilters;
  /** Comparison config (null = kapalı). */
  comparison?: ComparisonConfig | null;
  /** Aggregation sırasında dışlanan entity bilgisi (banner için). */
  restricted?: RestrictedScope | null;
  /**
   * `panel` — interaktif ekran (hover, action butonları, paginated).
   * `print` — PDF render (animasyon yok, full data, page-break disipliniyle).
   */
  mode: 'panel' | 'print';
  /**
   * i18n çözümleyici. `t(key, params?)` — params placeholder interpolation
   * için (`reports.restricted.banner` `{count}`/`{kind}`).
   */
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Workspace locale (örn. `'tr-TR'`). `Intl.NumberFormat` / `DateTimeFormat`. */
  locale: string;
}

/**
 * UI manifest — `@pusula/domain/reports` `MicroReportDataManifest` ile
 * aynı `id` üstünden eşlenir. 13G composer/registry birleşimi yapar.
 */
export interface MicroReportUiManifest<TData> {
  id: string;
  Component: ComponentType<MicroReportProps<TData>>;
  /**
   * Print mode için opsiyonel ayrı component. Set değilse `Component`
   * `mode='print'` propu ile yeniden render edilir (Pusula'nın DRY
   * disiplini — tek source-of-truth).
   */
  PrintComponent?: ComponentType<MicroReportProps<TData>>;
  /**
   * Excel export için saf veri dönüşümü. 13L (xlsx export) bu sözleşmeyi
   * kullanır; null/undefined → export desteği yok.
   */
  worksheetExport?(data: TData): {
    columns: ReadonlyArray<{ header: string; key: string; width?: number }>;
    rows: ReadonlyArray<Record<string, unknown>>;
  };
}

/** Domain `DeltaResult` ile UI delta props alignment (re-export utility). */
export type { DeltaResult };
