'use client';

import { CompassIcon, SparklesIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { useLeftPanel } from '@/app/(app)/_components/left-panel-context';
import { getLatestChangelogDay } from '@/lib/changelog-data';
import { strings } from '@/lib/strings';

type HomeHeroProps = {
  className?: string;
};

/**
 * Üst 1/3 karşılama bandı (§13.11, 2026-06-01). Card border'ı yok — sayfanın
 * arka planına gömülü, lokal aurora-vari blob'lar + ince dot pattern üzerine
 * tipografi. Marketing değil; günün karşılaması.
 *
 * Tipografi: `eyebrow` (`--primary` token, küçük + tracking-wide) → `<h1>`
 * iki parça (`titlePrefix` sade `--foreground` + `titleAccent` `--primary`
 * tonlarında gradient text) → `description` (`--muted-foreground`) → kompakt
 * **"Son yenilik" pill'i** (§13.11 — 2026-06-01). Pill tıklanınca sol
 * `WhatsNewPanel`'i açar (`useLeftPanel().openPanel('whatsNew')`); `/yenilikler`
 * sayfası ayakta kalmaya devam eder (SEO + landing footer için), panel ek yol.
 * Sağda dekoratif `CompassIcon` rozeti — ring + blur halo, sadece `lg+`'da.
 *
 * Erişilebilirlik: `<h1>` gerçek metin olarak `titleFull`'u taşır; ekran
 * okuyucu için tek, kararlı metin. Dekoratif arka plan + ikon `aria-hidden`.
 *
 * `<lg` ekranda gizlenir (accordion modunda yalnız sütun görünür) — `className`
 * ile `hidden lg:flex` page.tsx tarafından kontrol edilir.
 */
export function HomeHero({ className }: HomeHeroProps) {
  const copy = strings.home.hero;
  const latest = getLatestChangelogDay();
  const { openPanel } = useLeftPanel();
  return (
    <section
      aria-label={copy.titleFull}
      className={cn('relative isolate overflow-hidden rounded-lg', className)}
    >
      {/* Dekoratif arka plan: 2 yumuşak blob + ince dot pattern + vignette. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-primary/25 absolute -left-12 -top-16 size-72 rounded-full blur-3xl" />
        <div className="bg-primary/15 absolute -bottom-20 right-10 size-80 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* Vignette — kenarları zemine yumuşat. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 35%, color-mix(in oklch, var(--background) 60%, transparent) 100%)',
          }}
        />
      </div>

      <div className="relative flex h-full items-center justify-between gap-8 px-8 py-6 lg:px-10">
        <div className="min-w-0 max-w-2xl">
          <span className="text-primary text-xs font-semibold uppercase tracking-[0.22em]">
            {copy.eyebrow}
          </span>
          <h1 className="mt-3 text-balance text-4xl font-bold leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl">
            <span className="text-foreground">{copy.titlePrefix} </span>
            <span className="from-primary via-primary/85 to-primary/55 bg-gradient-to-r bg-clip-text text-transparent">
              {copy.titleAccent}
            </span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-balance text-sm lg:text-base">
            {copy.description}
          </p>
          {latest ? (
            <button
              type="button"
              onClick={() => openPanel('whatsNew')}
              aria-label={copy.latestNews.ariaLabel(
                latest.label,
                latest.entries.length,
              )}
              className="border-primary/20 bg-card/40 text-foreground hover:border-primary/40 hover:bg-card/60 focus-visible:ring-ring mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
            >
              <SparklesIcon
                className="text-primary size-3.5"
                strokeWidth={2}
                aria-hidden
              />
              <span className="font-medium">{copy.latestNews.label}</span>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <time dateTime={latest.date} className="text-muted-foreground">
                {latest.label}
              </time>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="text-primary font-medium">
                {copy.latestNews.countSuffix(latest.entries.length)}
              </span>
            </button>
          ) : null}
        </div>

        {/* Sağ dekoratif blok — kompakt cam ring + glow halo. */}
        <div aria-hidden className="relative hidden shrink-0 lg:block">
          <div className="bg-primary/25 absolute inset-0 -z-10 rounded-full blur-2xl" />
          <div className="border-primary/30 bg-card/40 text-primary flex size-28 items-center justify-center rounded-3xl border backdrop-blur-md">
            <CompassIcon className="size-14" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </section>
  );
}
