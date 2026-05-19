'use client';

import { useEffect, useRef } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import { cn } from '@pusula/ui';
import compassSpinnerAnimation from '@/assets/compass-spinner.json';
import { strings } from '@/lib/strings';

/**
 * `AppSpinner`'ın Lottie tabanlı görsel çekirdeği — `compass-spinner.json` +
 * `lottie-react`. Ayrı bir modülde tutulur; `app-spinner.tsx` bunu
 * `next/dynamic` ile yükler, böylece `lottie-react` board route'unun ilk JS
 * bundle'ına girmez (DEM-229 #5) — yalnız tam-sayfa/uzun yükleme ekranı
 * gösterildiğinde indirilir.
 */

export const lottieSpinnerSizes = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-7',
  lg: 'size-10',
} as const;

export type LottieSpinnerProps = {
  label?: string;
  showLabel?: boolean;
  size?: keyof typeof lottieSpinnerSizes;
  /** Lottie oynatma hızı çarpanı. <1 yavaşlatır (varsayılan: 0.5). */
  speed?: number;
  className?: string;
  animationClassName?: string;
  labelClassName?: string;
};

export function LottieSpinner({
  label = strings.common.loading,
  showLabel = false,
  size = 'md',
  speed = 0.5,
  className,
  animationClassName,
  labelClassName,
}: LottieSpinnerProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  // Lottie varsayılan hızı logonun seçilemeyeceği kadar hızlı — yavaşlat.
  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed]);

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'text-muted-foreground inline-flex items-center justify-center gap-2 text-sm',
        className,
      )}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={compassSpinnerAnimation}
        autoplay
        loop
        aria-hidden="true"
        // Lottie'nin sabit dolgu rengini geçersiz kılıp SVG yollarını `currentColor`'a
        // bağlar — böylece spinner sarıcının `text-*` rengini alır ve light/dark
        // tema değişiminde otomatik uyum sağlar.
        className={cn(
          'shrink-0 [&_path]:fill-current',
          lottieSpinnerSizes[size],
          animationClassName,
        )}
      />
      <span className={cn(showLabel ? undefined : 'sr-only', labelClassName)}>{label}</span>
    </div>
  );
}

export default LottieSpinner;
