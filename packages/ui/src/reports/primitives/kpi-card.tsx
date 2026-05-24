import type { DeltaResult } from '@pusula/domain/reports';
import { cn } from '../../lib/utils';
import { DeltaBadge } from './delta-badge';

export type KpiFormat = 'number' | 'percent' | 'duration' | 'date';

export interface KpiCardProps {
  /** Label i18n key (zorunlu). */
  labelKey: string;
  value: number | string | null;
  /** Önceki değer (comparison kapalıysa veya yoksa null). */
  previousValue?: number | null;
  delta?: DeltaResult;
  format?: KpiFormat;
  size?: 'sm' | 'md' | 'lg';
  mode?: 'panel' | 'print';
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
  className?: string;
  /** Inverse semantik (örn. "geciken kart artması kötü"). */
  semantics?: 'auto' | 'inverse';
}

function formatValue(value: number | string | null, format: KpiFormat, locale: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value / 100);
    case 'duration': {
      // Gün cinsi (ortalama yaşlanma vb.) — basit yuvarlama.
      const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
      return `${formatted}g`;
    }
    case 'date':
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
      }).format(new Date(value));
    case 'number':
    default:
      return new Intl.NumberFormat(locale).format(value);
  }
}

/**
 * KPI rozeti — tek metrik + opsiyonel delta. Spec §10 (UI akışı) +
 * §9.9 comparison disiplini. Default Tailwind Card primitive üstüne
 * inşa edilir (shadcn).
 */
export function KpiCard({
  labelKey,
  value,
  previousValue,
  delta,
  format = 'number',
  size = 'md',
  mode = 'panel',
  t,
  locale,
  semantics = 'auto',
  className,
}: KpiCardProps) {
  const formattedValue = formatValue(value, format, locale);
  const formattedPrev =
    previousValue !== undefined && previousValue !== null
      ? formatValue(previousValue, format, locale)
      : null;

  const valueClass =
    size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-2xl md:text-3xl';

  return (
    <div
      data-slot="kpi-card"
      data-mode={mode}
      data-size={size}
      className={cn(
        'flex flex-col gap-1 rounded-lg border bg-card p-3 text-card-foreground shadow-sm',
        mode === 'panel' && 'transition-shadow hover:shadow-md',
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t(labelKey)}
      </p>
      {/*
       * A11y S-4 (DEM-262): `<p>` accessible name kabul etmez ve label
       * zaten görünür → `aria-label` SR'a aynı metni 2-3 kez okuturdu.
       * Sıralı `<p>label</p>` + `<p>value</p>` doğal okuma akışı yeterli.
       */}
      <p className={cn('font-semibold tabular-nums text-foreground', valueClass)}>
        {formattedValue}
      </p>
      {(delta || formattedPrev) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta && <DeltaBadge delta={delta} t={t} locale={locale} mode={mode} semantics={semantics} />}
          {formattedPrev && (
            <span className="tabular-nums">{t('reports.kpi.previousLabel')} {formattedPrev}</span>
          )}
        </div>
      )}
    </div>
  );
}
