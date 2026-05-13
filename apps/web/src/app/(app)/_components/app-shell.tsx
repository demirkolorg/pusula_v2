'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LayoutGridIcon } from 'lucide-react';
import { Button, cn } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

type AppShellProps = {
  userName: string;
  children: ReactNode;
};

/**
 * Matches the board detail route (`/workspaces/<id>/boards/<boardId>` and below).
 * That screen is the only one that goes full-bleed — its board surface stretches
 * edge to edge; every other route stays in a centred max-width container.
 */
const BOARD_ROUTE = /^\/workspaces\/[^/]+\/boards\/[^/]+/;

/**
 * App chrome for signed-in users: a sticky header (brand + account link +
 * sign-out) over the page content. The board screen renders full-bleed (so the
 * board surface can reach the viewport edges); all other screens get a centred
 * `max-w-5xl` container with comfortable padding.
 */
export function AppShell({ userName, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const fullBleed = BOARD_ROUTE.test(pathname);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Sign-out is best-effort; we leave for /sign-in either way.
    } finally {
      router.replace('/sign-in');
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col',
        // Board route is viewport-bound (page scroll is suppressed; only the
        // list column's card stream scrolls). All other routes use `min-h-svh`
        // and grow with content like normal pages.
        fullBleed ? 'h-svh overflow-hidden' : 'min-h-svh',
      )}
    >
      <header className="bg-card sticky top-0 z-20 border-b shadow-card">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className={cn(
              'text-foreground inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            <span
              className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md"
              aria-hidden
            >
              <LayoutGridIcon className="size-3.5" />
            </span>
            {strings.common.appName}
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/account"
              title={strings.shell.accountSettings}
              className={cn(
                'text-muted-foreground hover:bg-accent hover:text-foreground hidden rounded-md px-2.5 py-1.5 text-sm transition-colors sm:inline-flex',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              )}
            >
              {userName}
            </Link>
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? strings.shell.signingOut : strings.shell.signOut}
            </Button>
          </div>
        </div>
      </header>
      {fullBleed ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      ) : (
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      )}
    </div>
  );
}
