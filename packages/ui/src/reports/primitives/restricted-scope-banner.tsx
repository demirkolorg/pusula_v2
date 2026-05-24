import { AlertTriangle } from 'lucide-react';
import { REPORT_I18N_KEYS, type RestrictedScope } from '@pusula/domain/reports';
import { cn } from '../../lib/utils';

export interface RestrictedScopeBannerProps {
  restricted: RestrictedScope;
  t: (key: string, params?: Record<string, unknown>) => string;
  mode?: 'panel' | 'print';
  className?: string;
}

/**
 * §9.4 "bilgi sızıntısı yok" rozeti — kullanıcının erişemediği alt
 * entity'lerin sayısı + tipi (örn. "2 panonuz görünürlüğünüz dışında").
 *
 * i18n key `reports.restricted.banner` interpolation `{count}` + `{kind}`
 * placeholder'larıyla — kindKey her scope kind için ayrı (`reports.restricted.kind.board`).
 */
export function RestrictedScopeBanner({
  restricted,
  t,
  mode = 'panel',
  className,
}: RestrictedScopeBannerProps) {
  const kindLabel = t(`reports.restricted.kind.${restricted.excludedKind}`);
  const text = t(REPORT_I18N_KEYS.restricted.banner, {
    count: restricted.excludedCount,
    kind: kindLabel,
  });
  return (
    <div
      data-slot="restricted-scope-banner"
      data-mode={mode}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900',
        'dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        mode === 'print' && 'border-amber-400',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="leading-snug">{text}</p>
    </div>
  );
}
