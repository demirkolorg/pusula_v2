import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ReportEmptyStateProps {
  /** i18n key — başlık (zorunlu). */
  i18nKey: string;
  /** Opsiyonel ek açıklama i18n key (`<i18nKey>.description` veya alt key). */
  descriptionKey?: string;
  icon?: ReactNode;
  t: (key: string, params?: Record<string, unknown>) => string;
  mode?: 'panel' | 'print';
  className?: string;
}

/**
 * Micro-report'lar için "veri yok" görseli (DEM-262). Generic `EmptyState`
 * (`@pusula/ui/empty-state`) üstüne i18n-aware sarmalayıcı; rapor
 * micro-report'unun `emptyStateKey` manifest alanını çağırır.
 */
export function ReportEmptyState({
  i18nKey,
  descriptionKey,
  icon,
  t,
  mode = 'panel',
  className,
}: ReportEmptyStateProps) {
  return (
    <div
      data-slot="report-empty-state"
      data-mode={mode}
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-10 text-center',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="text-muted-foreground/60">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <p className="text-sm font-medium text-foreground">{t(i18nKey)}</p>
      {descriptionKey ? (
        <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
      ) : null}
    </div>
  );
}
