import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * Hafif, bağımlılıksız CSS spinner. `AppSpinner`'ın Lottie tabanlı versiyonu
 * (`compass-spinner.json` + `lottie-react`) ağırdır; board kartı kapağı gibi
 * yoğun/sıcak yollarda ve `AppSpinner`'ın `next/dynamic` fallback'inde bu
 * Tailwind `animate-spin` çemberi kullanılır (DEM-229 #5 — `lottie-react`'i
 * board route ilk JS bundle'ından çıkarmak için).
 *
 * Renk `currentColor`'a bağlıdır — sarmalayıcının `text-*` rengini alır ve
 * light/dark tema değişiminde otomatik uyum sağlar (Lottie davranışıyla aynı).
 */

const spinnerSizes = {
  xs: 'size-4 border-2',
  sm: 'size-5 border-2',
  md: 'size-7 border-[3px]',
  lg: 'size-10 border-4',
} as const;

type CssSpinnerProps = {
  label?: string;
  showLabel?: boolean;
  size?: keyof typeof spinnerSizes;
  className?: string;
  spinnerClassName?: string;
  labelClassName?: string;
};

export function CssSpinner({
  label = strings.common.loading,
  showLabel = false,
  size = 'md',
  className,
  spinnerClassName,
  labelClassName,
}: CssSpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'text-muted-foreground inline-flex items-center justify-center gap-2 text-sm',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent',
          spinnerSizes[size],
          spinnerClassName,
        )}
      />
      <span className={cn(showLabel ? undefined : 'sr-only', labelClassName)}>{label}</span>
    </div>
  );
}
