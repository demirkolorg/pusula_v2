'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` ekranının transparan üst barı. Landing-page hissi için arka plan
 * rengi taşımaz — aurora hero'nun üstünde yüzer.
 *
 * İçerik: marka logosu (anasayfaya link), "Kayıt ol" linki ve tema anahtarı.
 * "Kayıt ol" ayrı bir sayfa değil — çok modlu cam kartın kayıt moduna götürür
 * (`/sign-in?mode=sign-up`). Mobilde de tek satırda düzgün durur (`min-w-0`).
 */
export function LandingNavbar() {
  const copy = strings.auth.landing;

  return (
    <header className="relative z-10 flex items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-12">
      <Link
        href="/"
        className="hover:text-foreground inline-flex min-w-0 items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <BrandLogo markClassName="size-9 rounded-xl" iconClassName="size-5" />
      </Link>

      <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Link
          href="/sign-in?mode=sign-up"
          className="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {copy.goToSignUpNav}
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
