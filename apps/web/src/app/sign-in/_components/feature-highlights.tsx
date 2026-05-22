'use client';

import type { LucideIcon } from 'lucide-react';
import { Bell, LayoutGrid, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` landing sayfasının "özellik vurguları" bölümü — board mockup'ın
 * altında render edilen üç mini özellik kartı. Board mockup'ın aksine bu
 * GERÇEK içeriktir (dekoratif değil) — bu yüzden semantik düzgün: her özellik
 * bir `<h3>` başlık taşır (sayfadaki `<h1>` hero / `<h2>` cam kart hiyerarşisini
 * bozmadan altına oturur).
 *
 * Metinler `strings.auth.landing.features`'tan gelir (3 öğe: `title` +
 * `text`). İkonlar lucide-react; renkler token türevidir.
 *
 * Yerleşim: `sm` ve üzeri yatay üçlü sıra, dar ekranda dikey istif. Açılışta
 * `motion` ile sırayla yumuşak yükselir; `prefers-reduced-motion` açıksa
 * statik görünür — aurora/board-mockup ile aynı desen.
 */

/** `strings.auth.landing.features` sırasıyla eşlenen ikonlar. */
const FEATURE_ICONS: readonly LucideIcon[] = [ShieldCheck, LayoutGrid, Bell];

export function FeatureHighlights() {
  const reduceMotion = useReducedMotion();
  const features = strings.auth.landing.features;

  return (
    <ul className="grid gap-5 text-left sm:grid-cols-3">
      {features.map((feature, index) => {
        const Icon = FEATURE_ICONS[index] ?? ShieldCheck;
        return (
          <motion.li
            key={feature.title}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 120,
                    damping: 18,
                    delay: index * 0.08,
                  }
            }
            className="bg-card/55 border-border/50 flex flex-col gap-2 rounded-xl border p-5 backdrop-blur-sm"
          >
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <Icon className="size-5" />
            </span>
            <h3 className="text-foreground text-base font-semibold">
              {feature.title}
            </h3>
            <p className="text-muted-foreground text-sm/relaxed">
              {feature.text}
            </p>
          </motion.li>
        );
      })}
    </ul>
  );
}
