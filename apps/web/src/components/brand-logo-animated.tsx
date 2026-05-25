'use client';

import { lazy, Suspense, useCallback, useState, type CSSProperties } from 'react';
import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BRAND_LOGO_SRC } from './brand-logo';

/**
 * `BrandLogo` (`variant="plain"`)'in animasyonlu sürümü — header için.
 *
 * Lottie kompass spinner iki tetikleyiciyle oynar:
 *  - **Periyodik:** 15 sn'de bir 1.5 sn dönüş.
 *  - **Hover:** dış sarmalayıcının `onMouseEnter`'i `playKey`'i artırır;
 *    `BrandLogoLottieMark` bu değişikliği yakalayıp anında spin başlatır.
 *    Chunk inmeden önceki hover'lar da sayılır — Lottie mount olunca ilk
 *    render'da birikmiş `playKey` ile spin oynar.
 *
 * `lottie-react` ağır bağımlılığı `BrandLogoLottieMark` modülünden `React.lazy`
 * ile yüklenir; chunk inene kadar (ve SSR'da) fallback olarak statik kompass
 * mask'i gösterilir — `BrandLogo` (`variant="plain"`) ile birebir aynı görünüm.
 *
 * Statik fallback `data-slot="brand-logo-mark"` + `bg-current` sınıflarını
 * korur; mevcut layout testleri kırılmaz.
 */

const BrandLogoLottieMark = lazy(() =>
  import('./brand-logo-lottie-mark').then((mod) => ({ default: mod.BrandLogoLottieMark })),
);

const compassMaskStyle = {
  WebkitMask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
  mask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
} satisfies CSSProperties;

type BrandLogoAnimatedProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  showText?: boolean;
};

export function BrandLogoAnimated({
  className,
  markClassName,
  textClassName,
  showText = true,
}: BrandLogoAnimatedProps) {
  const [playKey, setPlayKey] = useState(0);
  const handleMouseEnter = useCallback(() => {
    setPlayKey((key) => key + 1);
  }, []);

  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-2', className)}
      onMouseEnter={handleMouseEnter}
    >
      <Suspense
        fallback={
          <span
            data-slot="brand-logo-mark"
            className={cn('inline-block size-5 shrink-0 bg-current', markClassName)}
            style={compassMaskStyle}
            aria-hidden
          />
        }
      >
        <span
          data-slot="brand-logo-mark"
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center text-current',
            markClassName,
          )}
          aria-hidden
        >
          <BrandLogoLottieMark className="size-full" playKey={playKey} />
        </span>
      </Suspense>
      {showText ? (
        <span className={cn('truncate font-semibold tracking-tight', textClassName)}>
          {strings.common.appName}
        </span>
      ) : null}
    </span>
  );
}
