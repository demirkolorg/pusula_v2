'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Separator, boardBackgroundClass, cn } from '@pusula/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useUserRealtime } from '@/lib/realtime/use-user-realtime';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardSwitcher } from './board-switcher';
import { FontSizeToggle } from './font-size-toggle';
import { NotificationBell } from './notification-bell';
import { SearchDialog } from './search-dialog';
import { ThemeToggle } from './theme-toggle';
import { UserNavMenu } from './user-nav-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

type AppShellProps = {
  userName: string;
  userEmail: string;
  children: ReactNode;
};

type ActiveBoardPayload = {
  board?: {
    background?: string | null;
  };
};

/**
 * Matches the board detail route (`/workspaces/<id>/boards/<boardId>`).
 * That screen is the only one that goes full-bleed — settings and other child
 * routes stay in the standard centred page container.
 */
const BOARD_ROUTE = /^\/workspaces\/[^/]+\/boards\/[^/]+\/?$/;

/**
 * App chrome for signed-in users: a sticky header (brand + workspace/board
 * switchers + user actions) over the page content. The board screen renders full-bleed (so the
 * board surface can reach the viewport edges); all other screens get a centred
 * `max-w-5xl` container with comfortable padding.
 */
export function AppShell({ userName, userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const params = useParams<{ boardId?: string }>();
  const trpc = useTRPC();
  useUserRealtime();

  const fullBleed = BOARD_ROUTE.test(pathname);
  const boardId = typeof params.boardId === 'string' ? params.boardId : undefined;
  const activeBoard = useQuery({
    ...trpc.board.get.queryOptions({ boardId: boardId ?? '__none__' }),
    enabled: Boolean(fullBleed && boardId),
  });
  const activeBoardBackground = fullBleed
    ? ((activeBoard.data as ActiveBoardPayload | undefined)?.board?.background ?? null)
    : undefined;

  return (
    <div
      className={cn(
        'flex flex-col',
        fullBleed && boardBackgroundClass(activeBoardBackground),
        // Board route is viewport-bound (page scroll is suppressed; only the
        // list column's card stream scrolls). All other routes use `min-h-svh`
        // and grow with content like normal pages.
        fullBleed ? 'h-svh overflow-hidden' : 'min-h-svh',
      )}
    >
      <header
        className={cn(
          'sticky top-0 z-20 border-b',
          fullBleed
            ? 'border-board-shell bg-board-shell text-[color:var(--board-chrome-fg)]'
            : 'bg-card shadow-card',
        )}
      >
        <div className="mx-auto flex h-14 w-full items-center gap-4 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              href="/"
              aria-label={strings.common.appName}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight',
                fullBleed ? 'text-[color:var(--board-chrome-fg)]' : 'text-foreground',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              )}
            >
              <BrandLogo variant="plain" markClassName="size-5" textClassName="hidden sm:inline" />
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <WorkspaceSwitcher />
            <BoardSwitcher />
          </div>
          <div className="hidden min-w-0 flex-[0.8] justify-center md:flex">
            <SearchDialog enableShortcut triggerClassName="max-w-sm" />
          </div>
          <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
            <NotificationBell />
            <ThemeToggle />
            <FontSizeToggle />
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
