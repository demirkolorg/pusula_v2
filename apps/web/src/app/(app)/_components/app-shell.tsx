'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { boardRoleAtLeast, type BoardRole } from '@pusula/domain';
import { Separator, boardBackgroundClass, cn } from '@pusula/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useUserRealtime } from '@/lib/realtime/use-user-realtime';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardSwitcher } from './board-switcher';
import { ColorThemeToggle } from './color-theme-toggle';
import { EmailVerificationBanner } from './email-verification-banner';
import { FontSizeToggle } from './font-size-toggle';
import { NavigatorPanel } from './navigator-panel';
import { NavigatorToggle } from './navigator-toggle';
import { NotificationBell } from './notification-bell';
import { QuickNotesPanel } from './quick-notes-panel';
import { QuickNotesToggle } from './quick-notes-toggle';
import { SearchDialog } from './search-dialog';
import { ThemeToggle } from './theme-toggle';
import { UserNavMenu } from './user-nav-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

/** `localStorage` key for the global "Gezgin" panel open state. */
const NAVIGATOR_PANEL_KEY = 'pusula:navigator-panel-open';
/** `localStorage` key for the global "Hızlı Notlar" panel open state. */
const QUICK_NOTES_PANEL_KEY = 'pusula:quick-notes-panel-open';
/** Tailwind `lg` breakpoint (1024px); altında panel overlay sheet gibi davranır. */
const LG_QUERY = '(max-width: 1023px)';

/** `<lg` ekranda iki panel çakışmaması için mobilde mutex helper. */
function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(LG_QUERY).matches;
}

type AppShellProps = {
  userName: string;
  userEmail: string;
  /** Avatar image URL; omitted/`null` falls back to initials. */
  userImage?: string | null;
  emailVerified: boolean;
  children: ReactNode;
};

type ActiveBoardPayload = {
  board?: {
    background?: string | null;
    role?: BoardRole;
    archivedAt?: Date | string | null;
  };
};

/**
 * Matches the board detail route (`/workspaces/<id>/boards/<boardId>`).
 * That screen is the only one that goes full-bleed — settings and other child
 * routes stay in the standard centred page container.
 */
const BOARD_ROUTE = /^\/workspaces\/[^/]+\/boards\/[^/]+\/?$/;

/**
 * The `(app)` landing page (`/`). It renders the workspace-overview layout
 * (DEM-192) which uses the full viewport width — no centred max-width cap,
 * unlike the standard child routes that stay at `max-w-5xl`.
 */
const HOME_ROUTE = '/';

/**
 * App chrome for signed-in users: a sticky header (brand + workspace/board
 * switchers + user actions) over the page content. The board screen renders full-bleed (so the
 * board surface can reach the viewport edges); all other screens get a centred
 * `max-w-5xl` container with comfortable padding.
 */
export function AppShell({
  userName,
  userEmail,
  userImage,
  emailVerified,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const params = useParams<{ boardId?: string }>();
  const trpc = useTRPC();
  useUserRealtime();

  const fullBleed = BOARD_ROUTE.test(pathname);
  const isHome = pathname === HOME_ROUTE;
  const boardId = typeof params.boardId === 'string' ? params.boardId : undefined;

  // Global yan paneller (Gezgin + Hızlı Notlar) — SSR/first render için kapalı
  // başla, mount'ta localStorage tercihi adopt edilir. `lg+` (≥1024px) ekranda
  // persistent sidebar (içeriği sağa iter); `<lg` ekranda overlay sheet
  // (fixed + backdrop) olarak açılır, link/aksiyon sonrası kendini kapatır.
  // Mobilde mutex: ikisi aynı anda overlay olamaz (üst üste binme önlenir);
  // desktop'ta ikisi yan yana açılabilir.
  const [navigatorOpen, setNavigatorOpenState] = useState(false);
  const [quickNotesOpen, setQuickNotesOpenState] = useState(false);
  useEffect(() => {
    setNavigatorOpenState(window.localStorage.getItem(NAVIGATOR_PANEL_KEY) === 'true');
    setQuickNotesOpenState(window.localStorage.getItem(QUICK_NOTES_PANEL_KEY) === 'true');
  }, []);
  useEffect(() => {
    window.localStorage.setItem(NAVIGATOR_PANEL_KEY, String(navigatorOpen));
  }, [navigatorOpen]);
  useEffect(() => {
    window.localStorage.setItem(QUICK_NOTES_PANEL_KEY, String(quickNotesOpen));
  }, [quickNotesOpen]);

  // Mutex-aware setter'lar: mobilde birini açarken diğeri kapanır; desktop'ta
  // dokunmaz (her ikisi yan yana persistent kalabilir).
  const setNavigatorOpen = useCallback((value: boolean) => {
    setNavigatorOpenState(value);
    if (value && isMobileViewport()) setQuickNotesOpenState(false);
  }, []);
  const setQuickNotesOpen = useCallback((value: boolean) => {
    setQuickNotesOpenState(value);
    if (value && isMobileViewport()) setNavigatorOpenState(false);
  }, []);
  const closeNavigator = useCallback(() => setNavigatorOpenState(false), []);
  const closeQuickNotes = useCallback(() => setQuickNotesOpenState(false), []);
  const closeNavigatorOnMobile = useCallback(() => {
    if (isMobileViewport()) setNavigatorOpenState(false);
  }, []);
  const closeQuickNotesOnMobile = useCallback(() => {
    if (isMobileViewport()) setQuickNotesOpenState(false);
  }, []);

  const activeBoard = useQuery({
    ...trpc.board.get.queryOptions({ boardId: boardId ?? '__none__' }),
    enabled: Boolean(fullBleed && boardId),
  });
  const activeBoardPayload = activeBoard.data as ActiveBoardPayload | undefined;
  const activeBoardBackground = fullBleed
    ? (activeBoardPayload?.board?.background ?? null)
    : undefined;
  // Hızlı Not → Kart sürükle-bırak handle'ı sadece board ekranında + edit
  // yetkisi varsa görünür. Pano dışında `canConvert: false` (sadece CRUD).
  const activeBoardRole = activeBoardPayload?.board?.role;
  const activeBoardArchived = activeBoardPayload?.board?.archivedAt != null;
  const canConvertQuickNote =
    fullBleed &&
    activeBoardRole != null &&
    boardRoleAtLeast(activeBoardRole, 'member') &&
    !activeBoardArchived;

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
        // Faz 13S (DEM-275) — `data-app-chrome` mobile WebView embed mode'da
        // (`?embed=mobile`) CSS ile gizlenir (`embed-mobile.css`). Diğer hiçbir
        // ekranı etkilemez — yalnız Pusula mobile WebView'ın chrome-less render
        // ettiği rapor detay sayfasında body[data-embed-mode="mobile"] selector
        // bu header'ı kaldırır.
        data-app-chrome="header"
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
            <SearchDialog
              enableShortcut
              triggerClassName={cn(
                // Trigger blends into the header instead of reading as a bright
                // white field: a translucent variation of the chrome background.
                'max-w-sm shadow-none',
                fullBleed
                  ? 'border-white/10 bg-white/10 text-[color:var(--board-chrome-fg)] hover:bg-white/15 hover:text-[color:var(--board-chrome-fg)]'
                  : 'border-transparent bg-muted hover:bg-muted/70',
              )}
            />
          </div>
          <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
            <QuickNotesToggle
              open={quickNotesOpen}
              onToggle={() => setQuickNotesOpen(!quickNotesOpen)}
            />
            <NavigatorToggle
              open={navigatorOpen}
              onToggle={() => setNavigatorOpen(!navigatorOpen)}
            />
            <NotificationBell />
            <ThemeToggle />
            <ColorThemeToggle />
            <FontSizeToggle />
            <UserNavMenu userName={userName} userEmail={userEmail} userImage={userImage} />
          </div>
        </div>
      </header>
      {!emailVerified && <EmailVerificationBanner email={userEmail} />}
      {/* Trello-style "windowed" gövde: lg+'da row container shell rengini
          (`bg-board-shell` fullBleed'de; non-fullBleed'de transparan) gösterir;
          küçük `p-2 gap-2` padding/aralık ile sol panel ve içerik yan yana
          yuvarlak köşeli kartlar gibi durur. Mobilde padding/gap yok — sığacak
          yer yok; panel zaten overlay. */}
      <div
        className={cn(
          'flex',
          fullBleed
            ? 'bg-board-shell min-h-0 flex-1 lg:gap-2 lg:p-2'
            : 'flex-1 lg:gap-2 lg:p-2',
        )}
      >
        {/* Gezgin paneli — `lg+`: row akışında shrink-0 (içeriği iter, yuvarlak
            kart); `<lg`: fixed overlay + backdrop, link tıklamasında kapanır. */}
        {navigatorOpen && (
          <>
            <button
              type="button"
              aria-label={strings.board.navigator.close}
              onClick={closeNavigator}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:self-stretch">
              <NavigatorPanel onClose={closeNavigator} onNavigate={closeNavigatorOnMobile} />
            </div>
          </>
        )}

        {/* Hızlı Notlar paneli — Gezgin ile birebir aynı davranış. Mobilde
            mutex (setQuickNotesOpen helper'ı diğer paneli kapatır), desktop'ta
            ikisi yan yana açık olabilir. */}
        {quickNotesOpen && (
          <>
            <button
              type="button"
              aria-label={strings.board.quickNotes.close}
              onClick={closeQuickNotes}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:self-stretch">
              <QuickNotesPanel
                canConvert={canConvertQuickNote}
                onClose={closeQuickNotes}
                onNavigate={closeQuickNotesOnMobile}
              />
            </div>
          </>
        )}

        {fullBleed ? (
          // BoardDetailPage kendi içinde QuickNotes ve board content'i ayrı
          // kartlara böler; main sadece flex sarmalayıcı.
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        ) : (
          // `flex-1` panelin sağında kalan alanı doldurur; iç padding/center'lama
          // wrapper'da. Wrapper `mx-auto max-w-5xl` ile içeriği ortalar (DEM-192
          // landing'i `max-w-none` ile sınırsız tutar).
          <main className="min-w-0 flex-1">
            <div
              className={cn(
                'mx-auto w-full py-8',
                isHome ? 'max-w-none px-6' : 'max-w-5xl px-4',
              )}
            >
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
