'use client';

import { Star } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` cam giriş kartının altında render edilen sosyal-proof şeridi:
 * üst üste binmiş renkli avatar daireleri + kısa "ekip Pusula kullanıyor"
 * metni + beş yıldız.
 *
 * İçerik sahte/örnektir (gerçek müşteri verisi değil) — metin
 * `strings.auth.landing.socialProof`'tan gelir. Avatar renkleri `--palet-*`
 * token paletinden; yıldızlar lucide `Star`, `warning` token tonunda.
 *
 * Açılışta `motion` ile yumuşak belirir; `prefers-reduced-motion` açıksa
 * statik görünür — aurora/glass-card ile aynı desen.
 */

/** Avatar dairesi tonları — `--palet-*` token paleti (purge-güvenli). */
const AVATAR_TONE_CLASS: readonly string[] = [
  'bg-palet-mavi',
  'bg-palet-yesil',
  'bg-palet-turuncu',
  'bg-palet-mor',
  'bg-palet-pembe',
];

export function SocialProof() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.socialProof;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }
      }
      className="flex flex-col items-center gap-2 text-center"
    >
      {/* Üst üste binmiş avatar daireleri — saf süs (gerçek kullanıcı değil). */}
      <div aria-hidden="true" className="flex -space-x-2">
        {AVATAR_TONE_CLASS.map((toneClass) => (
          <span
            key={toneClass}
            className={`ring-background size-7 rounded-full ring-2 ${toneClass}`}
          />
        ))}
      </div>

      <p className="text-muted-foreground text-xs">{copy.text}</p>

      {/* Beş yıldız değerlendirme göstergesi — dekoratif. */}
      <div aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="fill-warning text-warning size-3.5" />
        ))}
      </div>
    </motion.div>
  );
}
