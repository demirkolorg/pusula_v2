'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGridIcon } from 'lucide-react';
import { Separator, cn } from '@pusula/ui';
import { useUserRealtime } from '@/lib/realtime/use-user-realtime';
import { strings } from '@/lib/strings';
import { BoardSwitcher } from './board-switcher';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { UserNavMenu } from './user-nav-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

type AppShellProps = {
  userName: string;
  userEmail: string;
  children: ReactNode;
};

/**
 * Matches the board detail route (`/workspaces/<id>/boards/<boardId>` and below).
 * That screen is the only one that goes full-bleed — its board surface stretches
 * edge to edge; every other route stays in a centred max-width container.
 */
const BOARD_ROUTE = /^\/workspaces\/[^/]+\/boards\/[^/]+/;

/**
 * App chrome for signed-in users: a sticky header (brand + workspace/board
 * switchers + user actions) over the page content. The board screen renders full-bleed (so the
 * board surface can reach the viewport edges); all other screens get a centred
 * `max-w-5xl` container with comfortable padding.
 */
export function AppShell({ userName, userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  useUserRealtime();

  const fullBleed = BOARD_ROUTE.test(pathname);

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
        <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              aria-label={strings.common.appName}
              className={cn(
                'text-foreground inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              )}
            >
              <span
                className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md"
                aria-hidden
              >
                <LayoutGridIcon className="size-3.5" />
              </span>
              <span className="hidden sm:inline">{strings.common.appName}</span>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <WorkspaceSwitcher />
            <BoardSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <UserNavMenu userName={userName} userEmail={userEmail} />
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
