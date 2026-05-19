/**
 * 404 — bulunamayan rota sayfası (`app/not-found.tsx`).
 *
 * Next.js App Router: eşleşmeyen tüm rotalarda gösterilir. Kök layout içinde
 * render olur — app shell DEĞİL (route grubu layout'ları devreye girmez).
 *
 * Tasarım: "Pusula marka temalı" (kullanıcı kararı 2026-05-19) — "Pusula"
 * yön bulma demek; compass metaforuyla kullanıcıyı geri yönlendirir.
 * Statik server component; tasarım token'larıyla, Türkçe metinler `strings`.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { CompassIcon } from 'lucide-react';
import { buttonVariants } from '@pusula/ui';
import { strings } from '@/lib/strings';

export const metadata: Metadata = {
  title: `${strings.notFound.title} — Pusula`,
};

export default function NotFound() {
  const copy = strings.notFound;

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
      {/* Compass rozeti — eş merkezli halkalar pusula gülü hissini verir. */}
      <div className="relative flex size-44 items-center justify-center" aria-hidden>
        <div className="border-primary/15 absolute size-44 rounded-full border" />
        <div className="border-primary/25 absolute size-32 rounded-full border" />
        <div className="bg-primary/10 text-primary flex size-24 items-center justify-center rounded-full">
          <CompassIcon className="size-12" strokeWidth={1.5} />
        </div>
      </div>

      <span className="text-muted-foreground mt-8 text-sm font-medium tracking-[0.3em]">
        {copy.badge}
      </span>
      <h1 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
        {copy.description}
      </p>

      <Link href="/" className={buttonVariants({ className: 'mt-8' })}>
        {copy.backHome}
      </Link>
    </main>
  );
}
