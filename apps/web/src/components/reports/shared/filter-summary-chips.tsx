/**
 * Faz 13G (DEM-263) — filtre özet pill'leri.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2 (panel header'da
 * filtre özet bar). Kompakt görünüm: "Son 30g • 3 üye • etiket: feature OR
 * bug • açık+kapalı". Panel'in üst bandında ve composer header'da reuse.
 */
'use client';

import { Badge } from '@pusula/ui';
import type { ComparisonConfig, ReportFilters } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface FilterSummaryChipsProps {
  filters: ReportFilters;
  comparison?: ComparisonConfig | null;
  /** "Yenile" callback'i — chip'lerden sonra (UI'da yer ayır). */
  className?: string;
}

export function FilterSummaryChips({ filters, comparison, className }: FilterSummaryChipsProps) {
  const { t } = useReportI18n();
  const items: Array<{ key: string; label: string }> = [];

  // Range
  const rangeLabel =
    filters.range.kind === 'preset'
      ? t(`reports.composer.range.preset.${filters.range.preset}`)
      : t('reports.composer.range.customSummary', {
          from: formatDateShort(filters.range.from),
          to: formatDateShort(filters.range.to),
        });
  items.push({ key: 'range', label: rangeLabel });

  // Members
  const memberCount = filters.members?.userIds.length ?? 0;
  if (memberCount > 0) {
    items.push({
      key: 'members',
      label: t('reports.composer.filter.members.summary', { count: memberCount }),
    });
  }

  // Labels
  const labelCount = filters.labels?.labelIds.length ?? 0;
  if (labelCount > 0) {
    items.push({
      key: 'labels',
      label: t('reports.composer.filter.labels.summary', {
        count: labelCount,
        mode: filters.labels?.mode === 'and'
          ? t('reports.composer.filter.labels.mode.and')
          : t('reports.composer.filter.labels.mode.or'),
      }),
    });
  }

  // Card status
  const statuses = filters.scopeFilter?.cardStatus ?? [];
  if (statuses.length > 0) {
    items.push({
      key: 'status',
      label: statuses
        .map((s) => t(`reports.filters.scope.cardStatus.${s}`))
        .join(' + '),
    });
  }

  // Comparison
  if (comparison?.enabled) {
    items.push({ key: 'comparison', label: t('reports.composer.comparison.summary') });
  }

  return (
    <div className={['flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}>
      {items.map((item, idx) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[11px] font-normal">
            {item.label}
          </Badge>
          {idx < items.length - 1 && (
            <span aria-hidden className="text-muted-foreground">·</span>
          )}
        </span>
      ))}
    </div>
  );
}

function formatDateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
