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
import {
  isLeftPanelId,
  LEFT_PANEL_IDS,
  LeftPanelProvider,
  type LeftPanelId,
} from './left-panel-context';
import { LeftRail } from './left-rail';
import { MyTasksPanel } from './my-tasks-panel';
import { NavigatorPanel } from './navigator-panel';
import { NotificationBell } from './notification-bell';
import { PlannerPanel } from './planner-panel';
import { QuickNotesPanel } from './quick-notes-panel';
import { SearchDialog } from './search-dialog';
import { ThemeToggle } from './theme-toggle';
import { UserNavMenu } from './user-nav-menu';
import { WhatsNewPanel } from './whats-new-panel';
import { WorkspaceSwitcher } from './workspace-switcher';

/**
 * Aktif sol global panel id'si — tek panel ilkesi (mutually exclusive):
 * aynı anda yalnız 1 panel açık olabilir. Yeni bir panel açılınca öncekisi
 * otomatik kapanır, aynı panele tekrar tıklamak onu kapatır. Mevcut 5 ayrı
 * boolean state + 5 localStorage key tek değere indirgendi (DEM follow-up).
 *
 * Tip + sabit `./left-panel-context` içinde; rail butonları + HomeHero pill
 * context'i de oradan tüketir (drift yok).
 */

/** Aktif sol panel id'sini tutan tek localStorage key (eski 5 key'in yerine). */
const ACTIVE_LEFT_PANEL_KEY = 'pusula:active-left-panel';

/**
 * Eski (Faz 16B/17 öncesi) per-panel açık/kapalı key'leri. İlk mount'ta
 * hepsi temizlenir; eğer yeni key boşsa ve eskilerden biri `true` ise o panel
 * aktif olarak migrate edilir (kullanıcı tercihi kaybolmasın).
 *
 * `whatsNew` 2026-06-01'de eklendiği için legacy boolean key'i yok — record
 * olarak `null` taşır (migrate look-up'ta atlanır).
 */
const LEGACY_PANEL_KEYS: Record<LeftPanelId, string | null> = {
  navigator: 'pusula:navigator-panel-open',
  quickNotes: 'pusula:quick-notes-panel-open',
  planner: 'pusula:planner-panel-open',
  myTasks: 'pusula:my-tasks-panel-open',
  activityFeed: 'pusula:activity-feed-panel-open',
  whatsNew: null,
};

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

  // Sol global panel sistemi — tek panel ilkesi (mutually exclusive):
  // 5 panelden (Gezgin / Hızlı Notlar / Planlayıcı / Görevlerim / Aktivite
  // Akışı) yalnız biri açık olabilir. Yeni panel açılınca öncekisi otomatik
  // kapanır; aynı butona tekrar basmak aktif paneli kapatır. Mobil/desktop
  // farkı YOK — her ekran boyutunda aynı tek panel davranışı (mobile mutex
  // zaten otomatik). `lg+`'da panel row akışına shrink-0 column olarak girer
  // (içeriği sağa iter), `<lg`'de fixed overlay sheet olarak açılır.
  //
  // SSR/first render kapalı (`null`); mount'ta localStorage'dan adopt edilir.
  // Eski (Faz 16B/17 öncesi) 5 ayrı boolean key'i temizlenir; eğer yeni key
  // boşsa ve eskilerden biri `true` ise o panel migrate edilir.
  const [activeLeftPanel, setActiveLeftPanel] = useState<LeftPanelId | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_LEFT_PANEL_KEY);
    if (isLeftPanelId(stored)) {
      setActiveLeftPanel(stored);
    } else {
      // Migration: yeni key boş — eski boolean key'lerden ilk `true` olanı al.
      // Öncelik sırası `LEFT_PANEL_IDS` ile aynı (Gezgin > Hızlı Notlar > ...).
      // `whatsNew` legacy key'i yok (2026-06-01'de eklendi); `null` döner ve
      // look-up'ta atlanır.
      const migrated = LEFT_PANEL_IDS.find((id) => {
        const legacyKey = LEGACY_PANEL_KEYS[id];
        return legacyKey != null && window.localStorage.getItem(legacyKey) === 'true';
      });
      if (migrated) setActiveLeftPanel(migrated);
    }
    // Eski key'leri her durumda temizle (artık kullanılmıyor). `whatsNew`'in
    // legacy key'i `null`; o adım atlanır.
    for (const id of LEFT_PANEL_IDS) {
      const legacyKey = LEGACY_PANEL_KEYS[id];
      if (legacyKey != null) window.localStorage.removeItem(legacyKey);
    }
  }, [pathname]);

  useEffect(() => {
    if (activeLeftPanel === null) {
      window.localStorage.removeItem(ACTIVE_LEFT_PANEL_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_LEFT_PANEL_KEY, activeLeftPanel);
    }
  }, [activeLeftPanel]);

  // Aktif panele tıklamak kapatır; başka panele tıklamak ona geçer (öncekisi
  // aynı tick'te kapanır, AnimatePresence sync mode ile A daralırken B genişler
  // → smooth slide).
  const togglePanel = useCallback((id: LeftPanelId) => {
    setActiveLeftPanel((prev) => (prev === id ? null : id));
  }, []);

  const closePanel = useCallback(() => {
    setActiveLeftPanel(null);
  }, []);

  /**
   * `LeftPanelContext` aracılığıyla `AppShell` dışından (örn. anasayfa
   * HomeHero pill'i) çağrılır. "Aç" semantiği taşır: zaten açıksa aynen
   * kalır, kapalıysa açar. `togglePanel`'den farkı bu — aynı id ile çağrılsa
   * bile kapanmaz.
   */
  const openPanel = useCallback((id: LeftPanelId) => {
    setActiveLeftPanel((prev) => (prev === id ? prev : id));
  }, []);

  // Derived booleans — JSX'in mevcut yapısı (5 ayrı AnimatePresence) bu
  // değerleri kullanır; state tek string ama render tarafı değişmedi.
  const navigatorOpen = activeLeftPanel === 'navigator';
  const quickNotesOpen = activeLeftPanel === 'quickNotes';
  const plannerOpen = activeLeftPanel === 'planner';
  const myTasksOpen = activeLeftPanel === 'myTasks';
  const activityFeedOpen = activeLeftPanel === 'activityFeed';
  const whatsNewOpen = activeLeftPanel === 'whatsNew';
  const anyPanelOpen = activeLeftPanel !== null;

  // Esc kısayolu — herhangi bir panel açıkken Esc'e basınca aktif panel
  // kapanır. Input/textarea/contentEditable focus'ta veya modal/dialog
  // açıkken tetiklenmez (Radix dialog `aria-modal="true"` attr'ı ile
  // işaretlenir), böylece dialog'un kendi Esc davranışı öncelikli kalır.
  useEffect(() => {
    if (!anyPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      )
        return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      closePanel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [anyPanelOpen, closePanel]);

  // `onNavigate` callback'i: mobile'da overlay panel açıkken kullanıcı bir
  // link/aksiyon tetikleyince panel kapanır. Tek panel ilkesinde ekran boyutu
  // farkı yok — her aksiyon paneli kapatır (kullanıcı zaten aktif paneli
  // izliyor, content alanına geçmek istiyor).
  const closeOnNavigate = closePanel;

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
    <LeftPanelProvider openPanel={openPanel}>
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
        {/* Sol dikey rail (Activity Bar) — 5 panelin toggle'ları. Tek panel
            ilkesi: aktif panele tıklamak onu kapatır, başka panele tıklamak
            ona geçer. */}
        <LeftRail
          activePanel={activeLeftPanel}
          onTogglePanel={togglePanel}
          fullBleed={fullBleed}
        />

        {/* Ortak backdrop — herhangi bir panel açıkken (`<lg` overlay modunda)
            görünür; tıklayınca aktif paneli kapatır. 5 ayrı backdrop yerine
            tek AnimatePresence (görsel olarak hepsi aynı). */}
        <AnimatePresence initial={false}>
          {anyPanelOpen && (
            <motion.button
              key="left-panel-backdrop"
              type="button"
              aria-label={strings.common.panels.closeBackdrop}
              onClick={closePanel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* 5 sol global panel — `lg+`: row akışında shrink-0 column (içeriği
            sağa iter, yuvarlak kart); `<lg`: fixed overlay sheet. Animasyon:
            width 0↔auto + opacity (smooth slide). Tek panel ilkesi sayesinde
            A→B geçişinde A daralırken B aynı tick'te genişler (AnimatePresence
            sync mode default). */}
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
              <NavigatorPanel
                onClose={closePanel}
                onNavigate={closeOnNavigate}
              />
            </motion.div>
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
                onClose={closePanel}
                onNavigate={closeOnNavigate}
              />
            </motion.div>
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
              <PlannerPanel
                onClose={closePanel}
                onNavigate={closeOnNavigate}
              />
            </motion.div>
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
              <MyTasksPanel
                onClose={closePanel}
                onNavigate={closeOnNavigate}
              />
            </motion.div>
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
                onClose={closePanel}
                onNavigate={closeOnNavigate}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {whatsNewOpen && (
            <motion.div
              key="whats-new-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 overflow-hidden lg:static lg:z-auto lg:self-stretch"
            >
              <WhatsNewPanel
                onClose={closePanel}
                onNavigate={closeOnNavigate}
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
    </LeftPanelProvider>
  );
}
