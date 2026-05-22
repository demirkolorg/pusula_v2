'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` hero'sunun `<h1>` başlığı — sabit ön/son metin arasında dönen
 * tek bir vurgu kelimesi. Kelime listesi {@link strings.auth.landing.heroHeadline}
 * `rotatingWords`'ten gelir; her ~2.6 sn'de bir sonrakine yumuşak (opacity + y)
 * geçişle değişir (`motion` + `AnimatePresence`).
 *
 * Erişilebilirlik — KRİTİK: `<h1>`'in erişilebilir adı STABİLDİR. Görünen
 * dönen kelime saf görsel efekttir; bu yüzden:
 *  - `<h1>` `aria-label` ile sabit, tam `heroHeadlineFull` metnini taşır —
 *    ekran okuyucu her zaman aynı kararlı başlığı duyar.
 *  - Görünen ön metin / dönen kelime / son metin `aria-hidden` ile erişilebilir
 *    ağacın dışında bırakılır (yoksa `aria-label` + görünür metin çakışır).
 *
 * `prefers-reduced-motion` açıksa ({@link useReducedMotion}) kelime dönmez —
 * ilk kelime sabit kalır, geçiş animasyonu oynamaz.
 *
 * Layout zıplaması, dönen kelimenin kendi satırında (`block`) render edilmesi
 * ve `min-h` ile sabit yükseklik tutmasıyla önlenir.
 */

/** Kelime değişim aralığı (ms) — okunacak kadar uzun, sıkıcı olmayacak kadar kısa. */
const ROTATE_INTERVAL_MS = 2600;

export function RotatingHeadline() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.heroHeadline;
  const words = copy.rotatingWords;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || words.length < 2) {
      // Reduce-motion oturum sırasında açılırsa donan kelimede kalmasın —
      // ilk kelimeye sıfırla (sabit, beklenen durum).
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, words.length]);

  const activeWord = words[index] ?? words[0] ?? '';

  return (
    <h1
      // Sabit erişilebilir ad — dönen kelimeden bağımsız, kararlı tam metin.
      aria-label={strings.auth.landing.heroHeadlineFull}
      // Hero başlığı — sayfa artık dikey kaydırmalı olduğu için masaüstünde
      // rahatça büyük (`sm:5xl`, `xl:6xl`); mobil ölçek (`4xl`) korunur.
      className="text-foreground text-4xl font-semibold tracking-tight sm:text-5xl xl:text-6xl/[1.1]"
    >
      {/* Görünen başlık — tamamı `aria-hidden`, `aria-label` ile çakışmasın. */}
      <span aria-hidden="true">
        {copy.prefix}{' '}
        {/* Dönen kelime kendi satırında: sabit `min-h` ile layout zıplamaz. */}
        <span className="text-primary relative block min-h-[1.15em] overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={activeWord}
              initial={reduceMotion ? false : { opacity: 0, y: '0.5em' }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: '-0.5em' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: 'easeOut' }}
              className="inline-block"
            >
              {activeWord}
            </motion.span>
          </AnimatePresence>
        </span>
        {copy.suffix}
      </span>
    </h1>
  );
}
