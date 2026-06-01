'use client';

import { lazy, Suspense, useCallback, useState, type CSSProperties } from 'react';
import { SparklesIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { useLeftPanel } from '@/app/(app)/_components/left-panel-context';
import { getLatestChangelogDay } from '@/lib/changelog-data';
import { strings } from '@/lib/strings';
import { BRAND_LOGO_SRC } from '@/components/brand-logo';

const BrandLogoLottieMark = lazy(() =>
  import('@/components/brand-logo-lottie-mark').then((mod) => ({
    default: mod.BrandLogoLottieMark,
  })),
);

const compassMaskStyle = {
  WebkitMask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
  mask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
} satisfies CSSProperties;

type HomeHeroProps = {
  className?: string;
};

/**
 * Üst 1/3 karşılama bandı (§13.11, 2026-06-01). Card border'ı yok — sayfanın
 * arka planına gömülü, **aurora drift** yapan iki yumuşak blob + ince dot
 * pattern üzerine tipografi. Marketing değil; günün karşılaması.
 *
 * Tipografi: `eyebrow` (`--primary` token, küçük + tracking-wide) → `<h1>`
 * iki parça (`titlePrefix` sade `--foreground` + `titleAccent` `--primary`
 * tonlarında gradient text) → `description` (`--muted-foreground`) → kompakt
 * **"Son yenilik" pill'i** (§13.11 — 2026-06-01). Pill tıklanınca sol
 * `WhatsNewPanel`'i açar (`useLeftPanel().openPanel('whatsNew')`); `/yenilikler`
 * sayfası ayakta kalmaya devam eder (SEO + landing footer için), panel ek yol.
 * Sağda dekoratif Pusula compass rozeti — ring + blur halo, sadece `lg+`'da.
 *
 * Animasyonlar — hepsi `globals.css` içindeki `prefers-reduced-motion: reduce`
 * guard'ı ile susturulur:
 *   - **Stagger entrance**: eyebrow → h1 → description → pill 80 ms aralıkla
 *     fade + slide-up (`.home-hero-fade-up` + `[animation-delay]`). Bir kez,
 *     mount'ta.
 *   - **Aurora drift**: arka plandaki 2 blur blob 22 sn / 28 sn periyotlarla,
 *     zıt fazda yavaşça kayar/scale alır (`.home-hero-drift-a/-b`).
 *   - **Gradient shimmer**: H1 accent kelime gradient pozisyonu 8 sn'de
 *     yavaşça sağa-sola kayar (`.home-hero-shimmer`).
 *   - **Sparkles twinkle**: pill içindeki ikon 7 sn'de bir kısa scale + rotate
 *     twinkle yapar (`.home-hero-twinkle`).
 *   - **Pill hover glow**: hover'da yumuşak primary glow + ikon dönüş/scale.
 *   - **Sağ rozet**: compass logosu Lottie ile 15 sn'de bir kısa spin + halo
 *     `animate-pulse` ile 5 sn'lik nefes; hover anında spin tetikler.
 *     `lottie-react` ağırdır → `React.lazy` + `Suspense` ile chunk olarak
 *     iner; fallback compass.svg mask'i (statik aynı görünüm).
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
  const [logoPlayKey, setLogoPlayKey] = useState(0);
  const handleLogoHover = useCallback(() => {
    setLogoPlayKey((key) => key + 1);
  }, []);
  return (
    <section
      aria-label={copy.titleFull}
      className={cn('relative isolate overflow-hidden rounded-lg', className)}
    >
      {/* Dekoratif arka plan: 2 yumuşak blob (aurora drift, 22 sn / 28 sn
          periyot, faz farklı) + ince dot pattern + vignette. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-primary/25 home-hero-drift-a absolute -left-12 -top-16 size-72 rounded-full blur-3xl" />
        <div className="bg-primary/15 home-hero-drift-b absolute -bottom-20 right-10 size-80 rounded-full blur-3xl" />
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
          <span className="text-primary home-hero-fade-up inline-block text-xs font-semibold uppercase tracking-[0.22em] [animation-delay:0ms]">
            {copy.eyebrow}
          </span>
          <h1 className="home-hero-fade-up mt-3 text-balance text-4xl font-bold leading-[1.1] tracking-tight [animation-delay:80ms] lg:text-5xl xl:text-6xl">
            <span className="text-foreground">{copy.titlePrefix} </span>
            <span className="from-primary via-primary/85 to-primary/55 home-hero-shimmer bg-gradient-to-r bg-clip-text text-transparent">
              {copy.titleAccent}
            </span>
          </h1>
          <p className="text-muted-foreground home-hero-fade-up mt-4 max-w-xl text-balance text-sm [animation-delay:160ms] lg:text-base">
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
              className="group border-primary/20 bg-card/40 text-foreground hover:border-primary/40 hover:bg-card/60 hover:shadow-primary/20 focus-visible:ring-ring home-hero-fade-up mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur-md transition-all duration-300 [animation-delay:240ms] hover:shadow-[0_0_24px_-4px_color-mix(in_oklch,var(--primary)_50%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
            >
              <SparklesIcon
                className="text-primary home-hero-twinkle size-3.5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
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

        {/* Sağ dekoratif blok — kompakt cam ring + glow halo. Hafif "nefes
            alan" pulse halo'da, Pusula compass logosu Lottie ile 15 sn'de bir
            kısa dönüş; hover anında dönüş tetikler. */}
        <div
          aria-hidden
          className="relative hidden shrink-0 lg:block"
          onMouseEnter={handleLogoHover}
        >
          <div className="bg-primary/25 absolute inset-0 -z-10 animate-pulse rounded-full blur-2xl [animation-duration:5s]" />
          <div className="border-primary/30 bg-card/40 text-primary flex size-28 items-center justify-center rounded-3xl border backdrop-blur-md">
            <Suspense
              fallback={
                <span
                  className="text-primary inline-block size-14 bg-current"
                  style={compassMaskStyle}
                  aria-hidden
                />
              }
            >
              <BrandLogoLottieMark className="size-14" playKey={logoPlayKey} />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
