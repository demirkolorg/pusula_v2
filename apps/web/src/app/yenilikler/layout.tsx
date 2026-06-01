'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants, cn } from '@pusula/ui';
import { AppShell } from '@/app/(app)/_components/app-shell';
import { AppSpinner } from '@/components/app-spinner';
import { BrandLogoAnimated } from '@/components/brand-logo-animated';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

/**
 * Yenilikler (changelog) sayfası layout'u — `/yenilikler`.
 *
 * **Hibrit kabuk (2026-06-01):**
 * - Oturum varsa: tam `AppShell` (header + sol rail + global paneller) ile
 *   sarılır — kullanıcı uygulamada gezinme akıntısını kaybetmez. App içinden
 *   user menü → "Yenilikler" veya panel altındaki "Tam sayfada aç" linki bu
 *   yolu kullanır.
 * - Oturum yoksa: minimal public chrome (Pusula logosu + "Giriş yap" CTA) +
 *   merkezde sayfa. Landing footer'dan gelen anonim ziyaretçi sayfayı yine
 *   okuyabilir (SEO + deep-link); login dayatılmaz.
 *
 * Oturum kontrolü client-side — web + API farklı origin'lerde (§8.1.1), RSC
 * cookie'yi okuyamaz. Bu yüzden layout `'use client'` ve `useSession()` ile
 * resolve sırasında küçük bir spinner gösterir.
 */
export default function ChangelogLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <AppSpinner label={strings.common.loading} showLabel />
      </div>
    );
  }

  if (session) {
    return (
      <AppShell
        userName={session.user.name || session.user.email}
        userEmail={session.user.email}
        userImage={session.user.image ?? null}
        emailVerified={session.user.emailVerified}
      >
        {children}
      </AppShell>
    );
  }

  // Anonim ziyaretçi — minimal public chrome.
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="bg-card border-border sticky top-0 z-20 border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            aria-label={strings.common.appName}
            className={cn(
              'text-primary inline-flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-md',
            )}
          >
            <BrandLogoAnimated markClassName="size-8" textClassName="hidden sm:inline" />
          </Link>
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            {strings.common.signIn}
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
