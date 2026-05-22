'use client';

import { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
} from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` landing sayfasının footer'dan önce render edilen istatistik
 * şeridi: dört metrik, her biri büyük sayı + altında etiket. Kendi
 * `<section>` kabuğunu ve dikey boşluğunu taşır.
 *
 * Sayılar şerit viewport'a girdiğinde ({@link useInView}) bir kez count-up
 * animasyonuyla 0'dan hedef değere artar (`motion`'ın `animate` sürücüsü).
 * `prefers-reduced-motion` açıksa ({@link useReducedMotion}) animasyon
 * atlanır, değer doğrudan son hâliyle gösterilir.
 *
 * İçerik (değer + etiket) `strings.auth.landing.stats`'tan gelir — değerler
 * sahte/örnektir, gerçek metrik değildir. Sayılar `tabular-nums` ile sabit
 * genişlikte; renkler tamamen token türevidir.
 *
 * Erişilebilirlik: şerit görünmez bir `<h2>` (sr-only) ile tanıtılır; her
 * metrik son değeriyle her zaman DOM'da bulunur (count-up yalnız görsel).
 *
 * Yerleşim: mobilde 2 sütun, `sm` ve üzeri tek satırda dört sütun.
 */

/** Sayıyı binlik ayraçlı, Türkçe yerel biçimde gösterir (1.234 gibi). */
const NUMBER_FORMAT = new Intl.NumberFormat('tr-TR');

type StatItem = {
  /** Hedef sayısal değer (count-up'ın varış noktası). */
  value: number;
  /** Sayının ardına eklenecek sabit ek (ör. `+`, `%`). */
  suffix: string;
  /** Sayının altındaki açıklama etiketi. */
  label: string;
};

/** Tek metrik — görünürlüğe gelince 0'dan `value`'ya sayan büyük rakam. */
function StatCard({
  item,
  active,
  reduceMotion,
}: {
  item: StatItem;
  /** Şerit viewport'a girdi mi — count-up'ı tetikler. */
  active: boolean;
  /** `prefers-reduced-motion` — true ise animasyon atlanır. */
  reduceMotion: boolean;
}) {
  const [display, setDisplay] = useState(reduceMotion ? item.value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(item.value);
      return;
    }
    if (!active) return;

    const controls = animate(0, item.value, {
      duration: 1.6,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [active, item.value, reduceMotion]);

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-foreground text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
        {NUMBER_FORMAT.format(display)}
        {item.suffix}
      </span>
      <span className="text-muted-foreground text-xs sm:text-sm">
        {item.label}
      </span>
    </div>
  );
}

export function StatsStrip() {
  const reduceMotion = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement>(null);
  // `once: true` — şerit bir kez görününce sayım başlar ve tekrar tetiklenmez.
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const copy = strings.auth.landing.stats;

  return (
    <motion.section
      ref={ref}
      aria-labelledby="stats-strip-heading"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
      className="relative z-10 px-6 py-12 sm:px-10 lg:py-16"
    >
      <h2 id="stats-strip-heading" className="sr-only">
        {copy.srHeading}
      </h2>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-4">
        {copy.items.map((item) => (
          <StatCard
            key={item.label}
            item={item}
            active={inView}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>
    </motion.section>
  );
}
