/**
 * Faz 13G (DEM-263) — panel başlık şeridi.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2.
 * Sol: filtre özet chips. Sağ: Yenile + Stale rozeti slot (13N) + aksiyon
 * dropdown.
 *
 * `isStale` 13G'de daima `false` (13N socket event'i yok); prop iskeleti
 * korunur — 13N geldiğinde wire'lanır.
 */
'use client';

import type { ReactNode } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button, cn } from '@pusula/ui';
import { StaleBadge } from '@pusula/ui/reports';
import type { ComparisonConfig, ReportFilters } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { FilterSummaryChips } from '../shared/filter-summary-chips';

export interface PanelHeaderProps {
  filters: ReportFilters;
  comparison?: ComparisonConfig | null;
  /** 13N (DEM-270) socket event tetiği — bu fazda daima false. */
  isStale?: boolean;
  /** Loading state'inde Yenile butonu animate. */
  isFetching?: boolean;
  onRefresh?: () => void;
  /** Sağ üstte ek aksiyon slot (composer'da action-bar zaten ayrı; panel
      detay sayfasında "Düzenle" / "Çoğalt" gibi butonlar gelebilir). */
  actions?: ReactNode;
  /** Compact (gömülü composer) vs default (standalone panel). */
  compact?: boolean;
}

export function PanelHeader({
  filters,
  comparison,
  isStale = false,
  isFetching = false,
  onRefresh,
  actions,
  compact = false,
}: PanelHeaderProps) {
  const { t } = useReportI18n();

  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4',
        compact ? 'py-2' : 'py-3',
      )}
      data-testid="report-panel-header"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <FilterSummaryChips filters={filters} comparison={comparison} />
        {isStale && onRefresh && (
          <StaleBadge visible={isStale} onRefresh={onRefresh} t={t} />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            data-testid="report-refresh-button"
            aria-label={t('reports.actions.refresh')}
          >
            <RefreshCwIcon className={cn('size-4', isFetching && 'animate-spin')} />
            {!compact && t('reports.actions.refresh')}
          </Button>
        )}
        {actions}
      </div>
    </header>
  );
}
