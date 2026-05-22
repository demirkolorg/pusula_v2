'use client';

import type { LucideIcon } from 'lucide-react';
import { Boxes, Compass, Hexagon, Layers, Orbit, Triangle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` landing sayfasının "ekipler güveniyor" logo bulutu — gerçek
 * içerikli bir başlık + jenerik/sahte marka "wordmark"larından oluşan soluk
 * bir şerit. Kendi `<section>` kabuğunu ve dikey boşluğunu taşır.
 *
 * Başlık ({@link strings.auth.landing.logoCloud.heading}) gerçek metindir ve
 * erişilebilir bir `<h2>` taşır. Marka adları sahte/jeneriktir — gerçek şirket
 * adı veya logosu KULLANILMAZ; her "logo" küçük bir lucide ikon + metinden
 * ibaret basit bir wordmark taklididir ve görsel olarak ikincil/soluk tutulur
 * (`text-muted-foreground`, hafif opaklık).
 *
 * Wordmark şeridinin kendisi dekoratiftir (`aria-hidden`) — ekran okuyucu
 * yalnızca başlığı duyar, sahte marka isimleri gürültü yapmaz.
 *
 * Yerleşim: başlık üstte ortalı, marka wordmark'ları altında esnek bir grid'de
 * (mobil 2 sütun, `sm` 3 sütun, `lg`+ altı marka tek satırda). Açılışta
 * `motion` ile yumuşak belirir; `prefers-reduced-motion` açıksa statik görünür.
 */

/** Her sahte marka için döngüsel atanan jenerik lucide ikon (marka logosu
 *  DEĞİL — soyut geometrik şekiller). */
const WORDMARK_ICONS: readonly LucideIcon[] = [
  Compass,
  Hexagon,
  Orbit,
  Layers,
  Triangle,
  Boxes,
];

export function LogoCloud() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.logoCloud;

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }
      }
      className="relative z-10 flex w-full flex-col items-center gap-7 px-6 py-10 sm:px-10 lg:py-14"
    >
      <h2 className="text-muted-foreground text-center text-xs font-medium tracking-wide uppercase">
        {copy.heading}
      </h2>

      {/* Sahte marka wordmark'ları — saf süs (aria-hidden), soluk/ikincil. */}
      <ul
        aria-hidden="true"
        className="text-muted-foreground/70 grid grid-cols-2 items-center justify-items-center gap-x-10 gap-y-6 sm:grid-cols-3 lg:grid-cols-6"
      >
        {copy.brands.map((brand, index) => {
          const Icon = WORDMARK_ICONS[index % WORDMARK_ICONS.length] ?? Compass;
          return (
            <li
              key={brand}
              className="flex items-center gap-1.5 opacity-80 transition-opacity hover:opacity-100"
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-sm font-semibold tracking-tight">
                {brand}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
