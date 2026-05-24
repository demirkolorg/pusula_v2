import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';
import { REPORT_I18N_KEYS, type DeltaResult } from '@pusula/domain/reports';
import { cn } from '../../lib/utils';

export interface DeltaBadgeProps {
  delta: DeltaResult;
  /** i18n çözümleyici (`t('reports.delta.up')` vb). */
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
  /**
   * Print mode → animasyon/transition disabled; renk korunur
   * (`print-color-adjust: exact` body-level).
   */
  mode?: 'panel' | 'print';
  className?: string;
  /**
   * `'auto'` (default) → up=yeşil, down=kırmızı.
   * `'inverse'` → up=kırmızı, down=yeşil (örn. "geciken sayısı arttı" trendi
   * kötü; UI bu durumlar için inverse geçirir).
   */
  semantics?: 'auto' | 'inverse';
}

const DIRECTION_KEY: Record<DeltaResult['direction'], string> = {
  up: REPORT_I18N_KEYS.delta.up,
  down: REPORT_I18N_KEYS.delta.down,
  neutral: REPORT_I18N_KEYS.delta.neutral,
  new: REPORT_I18N_KEYS.delta.new,
};

/**
 * Trend rozeti — `up`/`down`/`neutral`/`new` (DEM-262). Spec §9.9 +
 * `@pusula/domain/reports/comparison` `computeDelta` ile uyumlu.
 *
 * `pct` `null` ise (sıfır-bölme / "yeni"), sadece direction etiketi
 * gösterilir. `pct` mevcutsa `Intl.NumberFormat(locale)` ile `+12%` /
 * `-8%` formatlanır.
 */
export function DeltaBadge({
  delta,
  t,
  locale,
  mode = 'panel',
  semantics = 'auto',
  className,
}: DeltaBadgeProps) {
  const label = t(DIRECTION_KEY[delta.direction]);

  // Yön → renk paleti. Inverse semantik (örn. "geciken arttı = kötü") UI'ya
  // bırakılır; varsayılan auto.
  const positive = semantics === 'auto' ? 'up' : 'down';
  const negative = semantics === 'auto' ? 'down' : 'up';

  const colorClass =
    delta.direction === positive
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : delta.direction === negative
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
        : delta.direction === 'new'
          ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
          : 'bg-muted text-muted-foreground';

  const Icon =
    delta.direction === 'up'
      ? ArrowUp
      : delta.direction === 'down'
        ? ArrowDown
        : delta.direction === 'new'
          ? Sparkles
          : Minus;

  const formatted =
    delta.pct === null
      ? null
      : new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }).format(delta.pct / 100);

  return (
    <span
      data-slot="delta-badge"
      data-direction={delta.direction}
      data-mode={mode}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        // Print mode → transition kapalı (zaten static)
        mode === 'print' && 'transition-none',
        className,
      )}
      role="status"
      aria-label={`${label}${formatted ? ` ${formatted}` : ''}`}
    >
      <Icon className="size-3" aria-hidden />
      <span>{formatted ?? label}</span>
    </span>
  );
}
