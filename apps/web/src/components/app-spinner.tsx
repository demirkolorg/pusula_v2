'use client';

import { lazy, Suspense } from 'react';
import { CssSpinner } from '@/components/css-spinner';
import type { LottieSpinnerProps } from '@/components/lottie-spinner';

/**
 * Uygulama yükleme spinner'ı.
 *
 * Görsel çekirdek `compass-spinner.json` + `lottie-react`'tir; `lottie-react`
 * ağır bir bağımlılıktır ve board route'unun ilk JS bundle'ında yer kaplamamalı
 * (DEM-229 #5). Bu yüzden Lottie'li çekirdek (`LottieSpinner`) `React.lazy` ile
 * ayrı bir chunk'a alınır — `lottie-react` chunk'ı yalnız `AppSpinner` gerçekten
 * render edildiğinde indirilir.
 *
 * Chunk inerken (ve SSR'da) `Suspense` fallback'i olarak hafif CSS spinner
 * (`CssSpinner`) gösterilir. `next/dynamic` yerine `React.lazy` + `Suspense`
 * kullanılır çünkü fallback'in çağrı yerinden gelen prop'lara (özellikle
 * `label`) erişmesi gerekir — `next/dynamic`'in `loading` fallback'i prop almaz.
 *
 * Yoğun/sıcak yollarda (örn. board kart kapağı kısa yükleme göstergesi) doğrudan
 * `CssSpinner` kullan — orada Lottie aşırıdır. `AppSpinner` tam-sayfa / uzun
 * yükleme ekranları içindir.
 */

export type AppSpinnerProps = LottieSpinnerProps;

/**
 * `React.lazy` çağrısı modül yüklemesinde bir kez yapılır (her render'da yeni
 * component referansı remount'a yol açmasın).
 */
const LottieSpinner = lazy(() =>
  import('@/components/lottie-spinner').then((mod) => ({ default: mod.LottieSpinner })),
);

export function AppSpinner(props: AppSpinnerProps) {
  return (
    <Suspense
      fallback={
        <CssSpinner
          label={props.label}
          showLabel={props.showLabel}
          size={props.size}
          className={props.className}
          labelClassName={props.labelClassName}
        />
      }
    >
      <LottieSpinner {...props} />
    </Suspense>
  );
}
