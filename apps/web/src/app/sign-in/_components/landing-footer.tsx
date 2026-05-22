'use client';

import Link from 'next/link';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` landing sayfasının alt footer'ı: telif satırı + ince link grubu.
 * `text-xs` / `text-muted-foreground` tonu ve `focus-visible` ring deseniyle
 * sade kalır.
 *
 * İçerik `strings.auth.landing.footer` + `strings.common.appName`'ten gelir;
 * gizlilik linki `/gizlilik`'e, "Kayıt ol" çok modlu cam kartın kayıt moduna
 * (`/sign-in?mode=sign-up`) bağlanır — ayrı bir kayıt sayfası yoktur.
 *
 * Sayfa artık tek-viewport (`min-h-svh`) zorunlu değil — footer doğal akışta
 * içeriğin altında oturur (bkz. page.tsx layout değişikliği).
 */
export function LandingFooter() {
  const copy = strings.auth.landing.footer;

  const linkClass =
    'hover:text-foreground rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60';

  return (
    <footer className="border-border/50 relative z-10 border-t px-6 py-6 sm:px-10 lg:px-12">
      <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-xs sm:flex-row">
        <span>
          © {new Date().getFullYear()} {strings.common.appName}
        </span>
        <nav className="flex items-center gap-4">
          <Link href="/gizlilik" className={linkClass}>
            {copy.privacy}
          </Link>
          <Link href="/sign-in?mode=sign-up" className={linkClass}>
            {copy.signUp}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
