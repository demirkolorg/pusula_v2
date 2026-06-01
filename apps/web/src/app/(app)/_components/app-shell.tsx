'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { boardRoleAtLeast, type BoardRole } from '@pusula/domain';
import { Separator, boardBackgroundClass, cn } from '@pusula/ui';
import { BrandLogoAnimated } from '@/components/brand-logo-animated';
import { useReportRenderGlobal } from '@/lib/realtime/use-report-render-global';
import { useUserRealtime } from '@/lib/realtime/use-user-realtime';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { ActivityFeedPanel } from './activity-feed-panel';
import { BoardSwitcher } from './board-switcher';
import { ColorThemeToggle } from './color-theme-toggle';
import { EmailVerificationBanner } from './email-verification-banner';
import { FontToggle } from './font-toggle';
import { LeftRail } from './left-rail';
import { MyTasksPanel } from './my-tasks-panel';
import { NavigatorPanel } from './navigator-panel';
import { NotificationBell } from './notification-bell';
import { PlannerPanel } from './planner-panel';
import { QuickNotesPanel } from './quick-notes-panel';
import { SearchDialog } from './search-dialog';
import { ThemeToggle } from './theme-toggle';
import { UserNavMenu } from './user-nav-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

/** `localStorage` key for the global "Gezgin" panel open state. */
const NAVIGATOR_PANEL_KEY = 'pusula:navigator-panel-open';
/** `localStorage` key for the global "Hızlı Notlar" panel open state. */
const QUICK_NOTES_PANEL_KEY = 'pusula:quick-notes-panel-open';
/**
 * `localStorage` key for the global "Planlayıcı" panel open state
 * (Faz 16B / DEM-311). Gezgin/Hızlı Notlar key'leriyle birebir pattern;
 * anasayfa istisnası YOK (her zaman localStorage tercihini izler).
 */
const PLANNER_PANEL_KEY = 'pusula:planner-panel-open';
/** Faz 17 — "Görevlerim" panel açık durumu için localStorage anahtarı. */
const MY_TASKS_PANEL_KEY = 'pusula:my-tasks-panel-open';
/** Faz 17 — "Aktivite Akışı" panel açık durumu için localStorage anahtarı. */
const ACTIVITY_FEED_PANEL_KEY = 'pusula:activity-feed-panel-open';
/** Tailwind `lg` breakpoint (1024px); altında panel overlay sheet gibi davranır. */
const LG_QUERY = '(max-width: 1023px)';

/** `<lg` ekranda iki panel çakışmaması için mobilde mutex helper. */
function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(LG_QUERY).matches;
}

/**
 * Header'daki klasik `WorkspaceSwitcher` + `BoardSwitcher` görünürlüğü.
 * Gezgin paneli (sol global panel) workspace/board navigasyonunu üstlendiği
 * için bu switcher'lar şimdilik gizli. Kullanıcı geri ister(se hızlıca açmak
 * için bu sabiti `true` yap (kod ve importlar yerinde duruyor). Tamamen
 * kaldırma kararı verildiğinde bu sabit + JSX bloğu + ilgili importlar
 * temizlenir.
 */
const SHOW_HEADER_SWITCHERS = false;

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
  // Faz 13T (DEM-276) follow-up — rapor render bittiğinde her sayfadan
  // auto-download + persistent toast. Raporlar sayfası dışında da çalışır.
  useReportRenderGlobal();

  const fullBleed = BOARD_ROUTE.test(pathname);
  const isHome = pathname === HOME_ROUTE;
  const boardId = typeof params.boardId === 'string' ? params.boardId : undefined;

  // Global yan paneller (Gezgin + Hızlı Notlar + Planlayıcı + Görevlerim +
  // Aktivite Akışı — 5 panel) — SSR/first render için kapalı başla, mount'ta
  // localStorage tercihi adopt edilir. `lg+` (≥1024px) ekranda persistent
  // sidebar (içeriği sağa iter); `<lg` ekranda overlay sheet (fixed +
  // backdrop) olarak açılır, link/aksiyon sonrası kendini kapatır. Mobilde
  // mutex: beşi aynı anda overlay olamaz (üst üste binme önlenir);
  // desktop'ta beşi yan yana açılabilir (her panel shrink-0 column).
  //
  // Beş panel de aynı davranır: kullanıcı tercihi localStorage'da hatırlanır,
  // varsayılan kapalı, her sayfada (anasayfa dahil) toggle ile açılır.
  const [navigatorOpen, setNavigatorOpenState] = useState(false);
  const [quickNotesOpen, setQuickNotesOpenState] = useState(false);
  // Faz 16B (DEM-311) — Planlayıcı 3. global panel.
  const [plannerOpen, setPlannerOpenState] = useState(false);
  // Faz 17 — Görevlerim (4.) + Aktivite Akışı (5.) global paneller.
  const [myTasksOpen, setMyTasksOpenState] = useState(false);
  const [activityFeedOpen, setActivityFeedOpenState] = useState(false);
  useEffect(() => {
    setNavigatorOpenState(window.localStorage.getItem(NAVIGATOR_PANEL_KEY) === 'true');
    setQuickNotesOpenState(window.localStorage.getItem(QUICK_NOTES_PANEL_KEY) === 'true');
    setPlannerOpenState(window.localStorage.getItem(PLANNER_PANEL_KEY) === 'true');
    setMyTasksOpenState(window.localStorage.getItem(MY_TASKS_PANEL_KEY) === 'true');
    setActivityFeedOpenState(window.localStorage.getItem(ACTIVITY_FEED_PANEL_KEY) === 'true');
  }, [pathname]);
  useEffect(() => {
    window.localStorage.setItem(NAVIGATOR_PANEL_KEY, String(navigatorOpen));
  }, [navigatorOpen]);
  useEffect(() => {
    window.localStorage.setItem(QUICK_NOTES_PANEL_KEY, String(quickNotesOpen));
  }, [quickNotesOpen]);
  useEffect(() => {
    window.localStorage.setItem(PLANNER_PANEL_KEY, String(plannerOpen));
  }, [plannerOpen]);
  useEffect(() => {
    window.localStorage.setItem(MY_TASKS_PANEL_KEY, String(myTasksOpen));
  }, [myTasksOpen]);
  useEffect(() => {
    window.localStorage.setItem(ACTIVITY_FEED_PANEL_KEY, String(activityFeedOpen));
  }, [activityFeedOpen]);

  // Mutex-aware setter'lar: mobilde 5 panelden biri açılırken diğer dördü
  // kapanır (overlay üst üste binmesin); desktop'ta dokunmaz (beşi yan yana
  // persistent kalabilir, content shrink eder).
  const setNavigatorOpen = useCallback((value: boolean) => {
    setNavigatorOpenState(value);
    if (value && isMobileViewport()) {
      setQuickNotesOpenState(false);
      setPlannerOpenState(false);
      setMyTasksOpenState(false);
      setActivityFeedOpenState(false);
    }
  }, []);
  const setQuickNotesOpen = useCallback((value: boolean) => {
    setQuickNotesOpenState(value);
    if (value && isMobileViewport()) {
      setNavigatorOpenState(false);
      setPlannerOpenState(false);
      setMyTasksOpenState(false);
      setActivityFeedOpenState(false);
    }
  }, []);
  const setPlannerOpen = useCallback((value: boolean) => {
    setPlannerOpenState(value);
    if (value && isMobileViewport()) {
      setNavigatorOpenState(false);
      setQuickNotesOpenState(false);
      setMyTasksOpenState(false);
      setActivityFeedOpenState(false);
    }
  }, []);
  const setMyTasksOpen = useCallback((value: boolean) => {
    setMyTasksOpenState(value);
    if (value && isMobileViewport()) {
      setNavigatorOpenState(false);
      setQuickNotesOpenState(false);
      setPlannerOpenState(false);
      setActivityFeedOpenState(false);
    }
  }, []);
  const setActivityFeedOpen = useCallback((value: boolean) => {
    setActivityFeedOpenState(value);
    if (value && isMobileViewport()) {
      setNavigatorOpenState(false);
      setQuickNotesOpenState(false);
      setPlannerOpenState(false);
      setMyTasksOpenState(false);
    }
  }, []);
  const closeNavigator = useCallback(() => setNavigatorOpenState(false), []);
  const closeQuickNotes = useCallback(() => setQuickNotesOpenState(false), []);
  const closePlanner = useCallback(() => setPlannerOpenState(false), []);
  const closeMyTasks = useCallback(() => setMyTasksOpenState(false), []);
  const closeActivityFeed = useCallback(() => setActivityFeedOpenState(false), []);
  const closeNavigatorOnMobile = useCallback(() => {
    if (isMobileViewport()) setNavigatorOpenState(false);
  }, []);
  const closeQuickNotesOnMobile = useCallback(() => {
    if (isMobileViewport()) setQuickNotesOpenState(false);
  }, []);
  const closePlannerOnMobile = useCallback(() => {
    if (isMobileViewport()) setPlannerOpenState(false);
  }, []);
  const closeMyTasksOnMobile = useCallback(() => {
    if (isMobileViewport()) setMyTasksOpenState(false);
  }, []);
  const closeActivityFeedOnMobile = useCallback(() => {
    if (isMobileViewport()) setActivityFeedOpenState(false);
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
        'flex h-svh flex-col overflow-hidden',
        fullBleed && boardBackgroundClass(activeBoardBackground),
        // Tüm rotalar viewport-bound (sticky header + global yan paneller +
        // içerik-içi scroll). Sayfa içeriği `main` içinde `overflow-y-auto`
        // ile kendi scroll çubuğunu yönetir.
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
          'sticky top-0 z-20',
          fullBleed
            ? 'bg-board-shell text-[color:var(--board-chrome-fg)]'
            : 'bg-card shadow-card',
        )}
      >
        <div className="mx-auto flex h-14 w-full items-center gap-4 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              href="/"
              aria-label={strings.common.appName}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-md text-lg font-semibold tracking-tight',
                // Board (fullBleed) chrome'u koyu/renkli olduğu için logo + yazı
                // tamamen chrome-fg (beyaz) ile renklendirilir; warm board'larda
                // dahi maksimum kontrast.
                fullBleed ? 'text-[color:var(--board-chrome-fg)]' : 'text-primary',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              )}
            >
              <BrandLogoAnimated markClassName="size-8" textClassName="hidden sm:inline" />
            </Link>
            {SHOW_HEADER_SWITCHERS && (
              <>
                <Separator orientation="vertical" className="h-5" />
                <WorkspaceSwitcher />
                <BoardSwitcher />
              </>
            )}
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
            <ThemeToggle />
            <ColorThemeToggle />
            <FontToggle />
            <NotificationBell />
            <UserNavMenu userName={userName} userEmail={userEmail} userImage={userImage} />
          </div>
        </div>
      </header>
      {!emailVerified && <EmailVerificationBanner email={userEmail} />}
      {/* Trello-style "windowed" gövde: lg+'da row container shell rengini
          (fullBleed'de `bg-board-shell`; diğer ekranlarda `bg-muted` ayırıcı
          arka plan) gösterir; küçük `p-2 gap-2` padding/aralık ile sol panel
          ve içerik yan yana yuvarlak köşeli kartlar gibi durur. Mobilde
          padding/gap yok — sığacak yer yok; panel zaten overlay. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 lg:gap-2 lg:p-2',
          fullBleed ? 'bg-board-shell' : 'lg:bg-muted/50',
        )}
      >
        {/* Sol dikey rail (Activity Bar) — Gezgin + Hızlı Notlar toggle'ları.
            Header'da değil burada duruyor; panel sol kenarda açıldığı için
            açma noktası ile açılan yer aynı tarafta kalsın diye (DEM uyarlaması). */}
        <LeftRail
          navigatorOpen={navigatorOpen}
          quickNotesOpen={quickNotesOpen}
          plannerOpen={plannerOpen}
          myTasksOpen={myTasksOpen}
          activityFeedOpen={activityFeedOpen}
          onNavigatorToggle={() => setNavigatorOpen(!navigatorOpen)}
          onQuickNotesToggle={() => setQuickNotesOpen(!quickNotesOpen)}
          onPlannerToggle={() => setPlannerOpen(!plannerOpen)}
          onMyTasksToggle={() => setMyTasksOpen(!myTasksOpen)}
          onActivityFeedToggle={() => setActivityFeedOpen(!activityFeedOpen)}
          fullBleed={fullBleed}
        />

        {/* Gezgin paneli — `lg+`: row akışında shrink-0 (içeriği iter, yuvarlak
            kart); `<lg`: fixed overlay + backdrop, link tıklamasında kapanır.
            Açılıp kapanma animasyonu: backdrop fade + panel width 0↔auto +
            opacity (motion/AnimatePresence ile). Mobil overlay'de fixed
            wrapper soldan sağa doğru genişlediği için slide-in efekti verir;
            desktop'ta row akışında smooth pushed-content. */}
        <AnimatePresence initial={false}>
          {navigatorOpen && (
            <motion.button
              key="navigator-backdrop"
              type="button"
              aria-label={strings.board.navigator.close}
              onClick={closeNavigator}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {navigatorOpen && (
            <motion.div
              key="navigator-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <NavigatorPanel onClose={closeNavigator} onNavigate={closeNavigatorOnMobile} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hızlı Notlar paneli — Gezgin ile birebir aynı davranış. Mobilde
            mutex (setQuickNotesOpen helper'ı diğer paneli kapatır), desktop'ta
            ikisi yan yana açık olabilir. */}
        <AnimatePresence initial={false}>
          {quickNotesOpen && (
            <motion.button
              key="quick-notes-backdrop"
              type="button"
              aria-label={strings.board.quickNotes.close}
              onClick={closeQuickNotes}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {quickNotesOpen && (
            <motion.div
              key="quick-notes-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <QuickNotesPanel
                canConvert={canConvertQuickNote}
                onClose={closeQuickNotes}
                onNavigate={closeQuickNotesOnMobile}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Planlayıcı paneli (Faz 16B / DEM-311) — Gezgin/Hızlı Notlar ile
            birebir aynı pattern: lg+ persistent shrink-0, <lg overlay sheet.
            Mobil mutex 3-panel arası (setPlannerOpen helper'ı diğer ikisini
            kapatır); desktop'ta üçü yan yana açık olabilir. */}
        <AnimatePresence initial={false}>
          {plannerOpen && (
            <motion.button
              key="planner-backdrop"
              type="button"
              aria-label={strings.board.planner.close}
              onClick={closePlanner}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {plannerOpen && (
            <motion.div
              key="planner-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <PlannerPanel onClose={closePlanner} onNavigate={closePlannerOnMobile} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Görevlerim paneli (Faz 17) — diğer 4 panel ile birebir aynı
            davranış. lg+ persistent shrink-0, <lg overlay sheet. Mobil mutex
            5-panel arası `setMyTasksOpen` helper'ında yönetilir. */}
        <AnimatePresence initial={false}>
          {myTasksOpen && (
            <motion.button
              key="my-tasks-backdrop"
              type="button"
              aria-label={strings.board.myTasks.close}
              onClick={closeMyTasks}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {myTasksOpen && (
            <motion.div
              key="my-tasks-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <MyTasksPanel onClose={closeMyTasks} onNavigate={closeMyTasksOnMobile} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Aktivite Akışı paneli (Faz 17) — diğer 4 panel ile birebir aynı
            davranış. lg+ persistent shrink-0, <lg overlay sheet. Mobil mutex
            5-panel arası `setActivityFeedOpen` helper'ında yönetilir. */}
        <AnimatePresence initial={false}>
          {activityFeedOpen && (
            <motion.button
              key="activity-feed-backdrop"
              type="button"
              aria-label={strings.board.activityFeed.close}
              onClick={closeActivityFeed}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {activityFeedOpen && (
            <motion.div
              key="activity-feed-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <ActivityFeedPanel
                onClose={closeActivityFeed}
                onNavigate={closeActivityFeedOnMobile}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {fullBleed ? (
          // Board sayfası: main bir flex sarmalayıcı; BoardDetailPage kendi
          // `overflow-hidden` davranışını yönetir (kart sütun stream'i
          // scrollable).
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        ) : (
          // Non-board sayfalar: main kendi içinde scroll'lanır → outer
          // `h-svh overflow-hidden` ile birlikte body değil bu main scroll'lar.
          // Yan panel + header viewport'ta sabit kalır, içerik tek başına akar.
          // `lg+`: panel ile aynı stilde yuvarlak kart (Trello "windowed"
          // görünümü); shell rengi gap'ten görünür. Mobilde köşesiz/kenarsız
          // full-bleed kalır (sığması için).
          <main className="bg-background min-h-0 min-w-0 flex-1 overflow-y-auto lg:rounded-xl lg:border">
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
