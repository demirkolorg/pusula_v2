'use client';

import { useCallback, useEffect, useRef } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import { cn } from '@pusula/ui';
import compassSpinnerAnimation from '@/assets/compass-spinner.json';

/**
 * Header marka logosunun Lottie tabanlı çekirdeği: kompass animasyonunu
 * iki tetikleyiciyle oynatır:
 *  - **Periyodik:** 15 sn'de bir 1.5 sn dönüş (idle bekleyişle başlar,
 *    böylece sayfa açıldığında logo statik durur).
 *  - **Hover:** parent (`BrandLogoAnimated`) `playKey` prop'unu artırınca
 *    anında bir spin oynatır.
 *
 * Idle değilken (zaten dönerken) gelen tetik yok sayılır — animasyon
 * yeniden başa atılmaz, yarım kalmış spin sorunsuz tamamlanır.
 *
 * `lottie-react` ağır bir bağımlılıktır; bu modül `brand-logo-animated.tsx`
 * tarafından `React.lazy` ile yüklenir. Yani board route'unun ilk JS
 * bundle'ına girmez (DEM-229 #5 ile uyumlu); chunk inene kadar fallback
 * olarak statik kompass mask'i gösterilir.
 */

const SPIN_DURATION_MS = 1500;
const IDLE_DURATION_MS = 13500;

type BrandLogoLottieMarkProps = {
  className?: string;
  /**
   * Parent'tan gelen hover sinyali — her artış bir spin tetikler. `0`
   * (varsayılan) tetik yok demektir; mount'ta sadece periyodik döngü başlar.
   */
  playKey?: number;
};

export function BrandLogoLottieMark({ className, playKey = 0 }: BrandLogoLottieMarkProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const spinTimerRef = useRef<number | undefined>(undefined);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const cancelledRef = useRef(false);
  const isSpinningRef = useRef(false);

  const playSpin = useCallback(() => {
    const lottie = lottieRef.current;
    if (!lottie || cancelledRef.current) return;
    // Zaten dönüyor — yeni tetik yok sayılır (animasyon baştan başlatılmaz).
    if (isSpinningRef.current) return;
    // Bekleyen periyodik idle/spin timer'larını temizle; yeni döngü buradan akar.
    if (spinTimerRef.current !== undefined) window.clearTimeout(spinTimerRef.current);
    if (idleTimerRef.current !== undefined) window.clearTimeout(idleTimerRef.current);

    isSpinningRef.current = true;
    lottie.goToAndPlay(0, true);
    spinTimerRef.current = window.setTimeout(() => {
      isSpinningRef.current = false;
      if (cancelledRef.current) return;
      lottie.pause();
      // Bir sonraki periyodik dönüşü zamanla — hover spin de döngüyü sıfırlar.
      idleTimerRef.current = window.setTimeout(playSpin, IDLE_DURATION_MS);
    }, SPIN_DURATION_MS);
  }, []);

  // Periyodik döngünün başlangıcı — sayfa açıldığında logo statik dursun
  // diye ilk dönüş idle bekledikten sonra.
  useEffect(() => {
    cancelledRef.current = false;
    idleTimerRef.current = window.setTimeout(playSpin, IDLE_DURATION_MS);
    return () => {
      cancelledRef.current = true;
      if (spinTimerRef.current !== undefined) window.clearTimeout(spinTimerRef.current);
      if (idleTimerRef.current !== undefined) window.clearTimeout(idleTimerRef.current);
    };
  }, [playSpin]);

  // Hover tetiği — parent her hover'da `playKey`'i artırır. `0` mount değeri,
  // tetik sayılmaz; ilk gerçek hover'da effect çalışır ve spin başlar.
  useEffect(() => {
    if (playKey === 0) return;
    playSpin();
  }, [playKey, playSpin]);

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={compassSpinnerAnimation}
      autoplay={false}
      loop={false}
      aria-hidden
      className={cn('shrink-0 [&_path]:fill-current', className)}
    />
  );
}
