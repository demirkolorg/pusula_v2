import { RefreshCw } from 'lucide-react';
import { REPORT_I18N_KEYS } from '@pusula/domain/reports';
import { cn } from '../../lib/utils';

export interface StaleBadgeProps {
  visible: boolean;
  onRefresh: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Print mode'da `display: none` (print.css'te); prop yine de bilgi verir. */
  mode?: 'panel' | 'print';
  className?: string;
}

/**
 * §9.12 "Stale" rozeti — socket'ten `report.invalidated` event'i
 * geldiğinde görünür; otomatik refresh YOK, kullanıcı butonla tetikler.
 *
 * `print.css` `.stale-badge { display: none; }` PDF'te gizler.
 */
export function StaleBadge({
  visible,
  onRefresh,
  t,
  mode = 'panel',
  className,
}: StaleBadgeProps) {
  if (!visible) return null;
  return (
    <div
      data-slot="stale-badge"
      data-mode={mode}
      role="status"
      aria-live="polite"
      className={cn(
        'stale-badge inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900',
        'dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        className,
      )}
    >
      <span>{t(REPORT_I18N_KEYS.stale.message)}</span>
      <button
        type="button"
        onClick={onRefresh}
        className={cn(
          'inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-100 px-2 py-1 text-xs',
          'hover:bg-amber-200',
          // A11y S-5 (DEM-262): klavye-only focus indicator; AA ≥3:1
          // kontrast için ring rengi opaque + offset (amber-50/950 üstünde).
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50',
          'dark:border-amber-700 dark:bg-amber-900/40 dark:hover:bg-amber-900/60',
          'dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-amber-950',
        )}
        aria-label={t(REPORT_I18N_KEYS.actions.refresh)}
      >
        <RefreshCw className="size-3" aria-hidden />
        <span>{t(REPORT_I18N_KEYS.actions.refresh)}</span>
      </button>
    </div>
  );
}
