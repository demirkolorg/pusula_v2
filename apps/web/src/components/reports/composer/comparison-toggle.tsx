/**
 * Faz 13G (DEM-263) — comparison (period-over-period) toggle.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1 + §13 (delta UI).
 * Domain: docs/domain/09-raporlama-kurallari.md §9.9 — comparison etkin
 * olduğunda micro-report'lar `supportsComparison=true` ise delta gösterir.
 *
 * Mode: V1 yalnız `previousPeriod`. `sameLastYear` 13M (DEM-269) ile gelir.
 */
'use client';

import { InfoIcon } from 'lucide-react';
import {
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@pusula/ui';
import type { ComparisonConfig, RangePreset, ReportRange } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface ComparisonToggleProps {
  value: ComparisonConfig;
  onChange: (next: ComparisonConfig) => void;
  /** Şu anki filter range — period label ("son 30 gün" gibi) için. */
  range: ReportRange;
  disabled?: boolean;
}

/** Range'ten görüntülenecek period etiketi i18n key'ini çöz. */
function rangeLabelKey(range: ReportRange): string {
  if (range.kind === 'preset') return `reports.composer.range.preset.${range.preset}`;
  return 'reports.composer.range.custom';
}

const ALL_RANGE_PRESETS: ReadonlyArray<RangePreset> = [
  'today',
  'yesterday',
  'last7d',
  'last30d',
  'last90d',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
];

export function ComparisonToggle({ value, onChange, range, disabled }: ComparisonToggleProps) {
  const { t } = useReportI18n();
  const periodKey = rangeLabelKey(range);
  const periodLabel = t(periodKey) === periodKey ? '' : t(periodKey);

  // i18n key listesini kullanım dışı bırakmaktansa istemci derleme guard
  // — `ALL_RANGE_PRESETS` 13Q'da i18n key tarayıcı için tipi referans alır.
  void ALL_RANGE_PRESETS;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
        <Switch
          id="report-comparison-toggle"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            onChange({ enabled, mode: value.mode ?? 'previousPeriod' })
          }
          data-testid="report-comparison-switch"
        />
        <Label htmlFor="report-comparison-toggle" className="flex-1 cursor-pointer text-sm">
          {t('reports.composer.comparison.toggleLabel', {
            period: periodLabel,
          })}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('reports.composer.comparison.infoAriaLabel')}
              className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {t('reports.composer.comparison.infoTooltip')}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
