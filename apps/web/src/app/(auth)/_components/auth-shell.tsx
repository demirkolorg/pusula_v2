import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { strings } from '@/lib/strings';
import { AuthBrandPanel } from './auth-brand-panel';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background grid min-h-svh lg:grid-cols-2">
      <section className="flex min-h-svh flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="hover:text-foreground inline-flex min-w-0 items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <BrandLogo markClassName="size-9 rounded-xl" iconClassName="size-5" />
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Görev ve pano yönetimi
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </main>

        <footer className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            © {new Date().getFullYear()} {strings.common.appName}
          </span>
          <Link
            href="/sign-in"
            className="hover:text-foreground rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Yardım
          </Link>
        </footer>
      </section>

      <AuthBrandPanel />
    </div>
  );
}
