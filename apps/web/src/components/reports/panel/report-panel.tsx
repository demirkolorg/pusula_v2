/**
 * Faz 13G (DEM-263) — paylaşılan rapor panel'i.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2.
 * 13H (workspace /reports merkez) bu component'i saved report detay
 * sayfasında REUSE eder; composer'da inline embed gösterilir. Aynı
 * shape — saved vs ad-hoc fark etmez.
 *
 * Prop'lar generic: dataset (envelope) + i18n + loading + onRefresh.
 */
'use client';

import type { ReactNode } from 'react';
import { AppSpinner } from '@/components/app-spinner';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { useReportI18n } from '../hooks/use-report-i18n';
import { MicroReportGrid } from './micro-report-grid';
import { PanelHeader } from './panel-header';

export interface ReportPanelProps {
  dataset: ReportEnvelope | null;
  loading?: boolean;
  /** Generic error mesajı (tRPC error.message); null/undefined → loading veya success. */
  errorMessage?: string | null;
  /** 13N stale rozeti tetiği — bu fazda daima false. */
  isStale?: boolean;
  onRefresh?: () => void;
  /** Sağ üstte ek aksiyon (örn. "Düzenle" 13H detay sayfasında). */
  headerActions?: ReactNode;
  /** Compact panel (composer içine gömülü) vs default (standalone sayfa). */
  compact?: boolean;
  /**
   * Faz 13L (DEM-268) — PNG/SVG export tetikleyici. Set edildiğinde her
   * `supportsPngExport: true` widget'a overlay menü eklenir.
   */
  onExportPng?: (input: { microReportId: string; format: 'png' | 'svg' }) => void;
  /** Export mutation pending (UX disable). */
  exportPending?: boolean;
}

export function ReportPanel({
  dataset,
  loading,
  errorMessage,
  isStale,
  onRefresh,
  headerActions,
  compact,
  onExportPng,
  exportPending,
}: ReportPanelProps) {
  const { t } = useReportI18n();

  if (loading && !dataset) {
    return (
      <div className="rounded-lg border bg-card p-12">
        <AppSpinner label={t('reports.panel.loading')} showLabel />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm"
        data-testid="report-panel-error"
      >
        <p className="font-medium text-destructive">{t('reports.panel.errorTitle')}</p>
        <p className="mt-1 text-muted-foreground">{errorMessage}</p>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        {t('reports.panel.emptyState')}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border bg-card"
      data-testid="report-panel"
      data-loading={loading ? 'true' : 'false'}
    >
      <PanelHeader
        filters={dataset.filters}
        comparison={dataset.comparison}
        comparisonRange={dataset.comparisonRange}
        isStale={isStale}
        isFetching={loading}
        onRefresh={onRefresh}
        actions={headerActions}
        compact={compact}
      />
      <div className="p-4">
        <MicroReportGrid
          dataset={dataset}
          onExportPng={onExportPng}
          exportPending={exportPending}
        />
      </div>
    </div>
  );
}
