'use client';

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { boardRoleAtLeast } from '@pusula/domain';
import { Alert, AlertDescription, AlertTitle, boardBackgroundClass, cn } from '@pusula/ui';
import { useSession } from '@/lib/auth-client';
import { useShortcutScope } from '@/lib/shortcuts';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { useBoardRealtime } from '@/lib/realtime';
import { BoardAccessRequestScreen } from './_components/board-access-request-screen';
import { BoardColumns } from './_components/board-columns';
import { QuickNotesPanel } from './_components/quick-notes-panel';
import { countArchivedLists, type DueDateFilter } from './_components/board-filter';
import type { BoardFilterLabel } from './_components/board-filter-bar';
import { BoardSkeleton } from './_components/board-skeleton';
import { BoardTopBar } from './_components/board-top-bar';
import { CardDetailRoute } from './_components/card-detail/card-detail-route';

/** `localStorage` key for the "Hızlı Notlar" panel open state (DEM-205). */
const QUICK_NOTES_PANEL_KEY = 'pusula:quick-notes-panel-open';

/**
 * `ShortcutHelpDialog` nadiren açılan bir modal — yalnız `?` kısayoluyla
 * açılır. `next/dynamic` ile lazy yüklenir (DEM-229 #3); aşağıda yalnız
 * `shortcutHelpOpen` true iken render edildiğinden chunk board route'unun ilk
 * JS bundle'ına girmez, ilk açılışta indirilir. Client-only modal → `ssr: false`.
 */
const ShortcutHelpDialog = dynamic(
  () => import('./_components/shortcut-help-dialog').then((mod) => mod.ShortcutHelpDialog),
  { ssr: false },
);

function BoardShortcutScope({
  enabled,
  canEditBoardContent,
  hasActiveList,
  onOpenBoardSearch,
  onOpenHelp,
  onOpenFirstCardComposer,
  onOpenAddListComposer,
}: {
  enabled: boolean;
  canEditBoardContent: boolean;
  hasActiveList: boolean;
  onOpenBoardSearch: () => void;
  onOpenHelp: () => void;
  onOpenFirstCardComposer: () => void;
  onOpenAddListComposer: () => void;
}) {
  const searchParams = useSearchParams();
  const cardModalOpen = searchParams.has('card');

  useShortcutScope({
    scope: 'board',
    enabled: enabled && !cardModalOpen,
    bindings: [
      {
        id: 'board-search',
        match: (event) => event.key === '/' && !event.ctrlOrMeta && !event.alt,
        run: onOpenBoardSearch,
      },
      {
        id: 'shortcut-help',
        match: (event) => event.key === '?' && !event.ctrlOrMeta && !event.alt,
        run: onOpenHelp,
      },
      {
        id: 'new-card',
        match: (event) => event.key === 'n' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent && hasActiveList) onOpenFirstCardComposer();
        },
      },
      {
        id: 'new-list-shift-n',
        match: (event) => event.key === 'n' && event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
      {
        id: 'new-list-l',
        match: (event) => event.key === 'l' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
    ],
  });

  return null;
}

/**
 * Board detail (read-only CRUD, no drag-and-drop yet). One `board.get` call
 * returns `{ board (with the viewer's effective role), lists (archived included,
 * position-sorted), cards (active only, position-sorted, with labels + metadata
 * counts + members) }`. List/card CRUD goes through `list.*` / `card.*` and then
 * invalidates `board.get` — no optimistic UI yet (Phase 4 — DEM-27).
 * Drag-and-drop is Phase 3 (DEM-26). Authorization is server-side; the UI only
 * hides actions the role can't perform. Phase 2.7B (DEM-63) is the visual polish
 * pass — top bar + columns + card metadata + skeleton.
 */
export default function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id: workspaceId, boardId } = use(params);
  const trpc = useTRPC();
  const accessContext = useQuery(trpc.board.accessRequests.context.queryOptions({ boardId }));
  const hasBoardAccess = accessContext.data?.access.hasAccess === true;
  // DEM-226 #6 — `board.get` realtime (`useBoardRealtime`) ile sürekli senkron
  // tutuluyor; uzun `staleTime` + odak-yenilemesi kapalı, böylece sekme odağı
  // her değiştiğinde tüm pano refetch edilip yeniden render olmaz. Realtime kopar
  // veya `seq` boşluğu olursa hook zaten elle refetch tetikler.
  const board = useQuery(
    trpc.board.get.queryOptions(
      { boardId },
      { enabled: hasBoardAccess, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
    ),
  );
  // Referans verisi (etiket paleti / pano üyeleri) nadiren değişir ve değiştiğinde
  // realtime invalidasyonu zaten cache'i tazeler — uzun `staleTime` ver.
  const labelList = useQuery(
    trpc.label.list.queryOptions(
      { boardId },
      { enabled: hasBoardAccess, staleTime: 5 * 60 * 1000 },
    ),
  );
  const boardMembers = useQuery(
    trpc.board.members.list.queryOptions(
      { boardId },
      { enabled: hasBoardAccess, staleTime: 5 * 60 * 1000 },
    ),
  );
  // Phase 5C (DEM-85) — keep `board.get` in sync with concurrent edits from
  // other users. Subscribes to `board:{boardId}` on mount, applies envelopes,
  // refetches on `seq` gap / reconnect. `connected` drives the disconnect banner;
  // `joined` marks deterministic room readiness for e2e sync tests.
  const realtime = useBoardRealtime(boardId, { enabled: hasBoardAccess && board.isSuccess });
  // Viewer identity drives the per-viewer "assigned to me" filter; it is not
  // needed for authorization (that stays server-side).
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? null;
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('all');
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [showArchivedCards, setShowArchivedCards] = useState(false);
  const [boardSearchOpen, setBoardSearchOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  // "Hızlı Notlar" panel (DEM-205). Starts closed to keep the SSR/first render
  // deterministic, then adopts the persisted preference on mount.
  const [quickNotesOpen, setQuickNotesOpen] = useState(false);
  useEffect(() => {
    setQuickNotesOpen(window.localStorage.getItem(QUICK_NOTES_PANEL_KEY) === 'true');
  }, []);
  useEffect(() => {
    window.localStorage.setItem(QUICK_NOTES_PANEL_KEY, String(quickNotesOpen));
  }, [quickNotesOpen]);
  const [openFirstCardComposerToken, setOpenFirstCardComposerToken] = useState(0);
  const [openAddListComposerToken, setOpenAddListComposerToken] = useState(0);
  const archivedCards = useQuery(
    trpc.card.listArchived.queryOptions(
      { boardId },
      { enabled: hasBoardAccess && showArchivedCards },
    ),
  );
  const boardCardsForFilters = board.data?.cards ?? [];
  const boardListsForFilters = board.data?.lists ?? [];

  // `BoardColumns`'a geçen `boardMembers` prop'u: her render'da yeni dizi
  // üretmemek için `boardMembers.data` üzerinden bir kez türet — aksi halde
  // referans her render'da değişip `BoardColumns` (ve dolayısıyla `CardItem`)
  // memoizasyonunu kırar (DEM-226 #2).
  const boardMemberOptions = useMemo(
    () =>
      (boardMembers.data ?? []).map((member) => ({
        userId: member.userId,
        name: member.name,
      })),
    [boardMembers.data],
  );

  const boardLabels = useMemo<BoardFilterLabel[]>(() => {
    const byId = new Map<string, BoardFilterLabel>();
    for (const card of boardCardsForFilters) {
      for (const label of card.labels) {
        if (!byId.has(label.labelId)) {
          byId.set(label.labelId, { id: label.labelId, name: label.name, color: label.color });
        }
      }
    }
    return [...byId.values()].sort(
      (a, b) => a.name.localeCompare(b.name, 'tr') || a.color.localeCompare(b.color),
    );
  }, [boardCardsForFilters]);

  const liveSelectedLabelIds = useMemo<ReadonlySet<string>>(() => {
    if (selectedLabelIds.size === 0) return selectedLabelIds;
    const live = new Set<string>();
    for (const id of selectedLabelIds) {
      if (boardLabels.some((label) => label.id === id)) live.add(id);
    }
    return live;
  }, [selectedLabelIds, boardLabels]);

  useEffect(() => {
    if (liveSelectedLabelIds.size !== selectedLabelIds.size) {
      setSelectedLabelIds(liveSelectedLabelIds);
    }
  }, [liveSelectedLabelIds, selectedLabelIds.size]);

  const toggleLabelFilter = (labelId: string) =>
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });

  const archivedListCount = useMemo(
    () => countArchivedLists(boardListsForFilters),
    [boardListsForFilters],
  );

  const backLink = (
    <Link
      href={`/workspaces/${workspaceId}`}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ArrowLeftIcon className="size-3.5" />
      {strings.board.detail.backToWorkspace}
    </Link>
  );

  if (accessContext.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardSkeleton />
      </div>
    );
  }

  if (accessContext.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.board.detail.accessContextLoadErrorTitle}</AlertTitle>
          <AlertDescription>
            {accessContext.error.message || strings.common.unknownError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!accessContext.data.access.hasAccess) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardAccessRequestScreen boardId={boardId} context={accessContext.data} />
      </div>
    );
  }

  if (board.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardSkeleton />
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.board.detail.loadErrorTitle}</AlertTitle>
          <AlertDescription>{board.error.message || strings.common.unknownError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { board: b, lists, cards } = board.data;
  const archived = b.archivedAt != null;
  const isBoardAdmin = b.role === 'admin';
  const canEditBoardContent = boardRoleAtLeast(b.role, 'member') && !archived;
  const hasActiveList = lists.some((list) => list.archivedAt == null);

  return (
    <div
      // App-shell header rengi (`bg-board-shell`); panel ile pano arasındaki
      // `gap` bu rengi bir şerit olarak gösterir (Trello "Gelen Kutusu" deseni).
      className="bg-board-shell flex min-h-0 flex-1 gap-2"
      data-realtime-board-id={boardId}
      data-realtime-board-joined={realtime.joined ? 'true' : 'false'}
    >
      {/* Hızlı Notlar paneli — pano başlık çubuğu dâhil tüm pano yüzeyinin
          soluna, ayrı bir parça olarak oturur (yalnız app-shell header sabit). */}
      {quickNotesOpen && (
        <QuickNotesPanel
          canConvert={canEditBoardContent}
          background={b.background ?? null}
          onClose={() => setQuickNotesOpen(false)}
        />
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          boardBackgroundClass(b.background ?? null),
        )}
      >
        <BoardTopBar
          boardId={boardId}
          workspaceId={workspaceId}
          title={b.title}
          icon={b.icon}
          background={b.background ?? null}
          archived={archived}
          isBoardAdmin={isBoardAdmin}
          boardSearchOpen={boardSearchOpen}
          onBoardSearchOpenChange={setBoardSearchOpen}
          filter={{
            labels: boardLabels,
            selectedLabelIds: liveSelectedLabelIds,
            onToggleLabel: toggleLabelFilter,
            onClearLabels: () => setSelectedLabelIds(new Set()),
            dueDateFilter,
            onDueDateFilterChange: setDueDateFilter,
          }}
          assignedToMe={{
            active: assignedToMeOnly,
            onToggle: () => setAssignedToMeOnly((value) => !value),
          }}
          quickNotes={{
            open: quickNotesOpen,
            onToggle: () => setQuickNotesOpen((value) => !value),
          }}
          archive={{
            lists,
            canEdit: canEditBoardContent,
            showArchivedLists,
            onToggleArchivedLists: () => setShowArchivedLists((value) => !value),
            showArchivedCards,
            onToggleArchivedCards: () => setShowArchivedCards((value) => !value),
            archivedListCount,
          }}
        />

        {!realtime.connected && (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-1 text-center text-xs text-amber-700 dark:text-amber-300"
          >
            {strings.realtime.disconnected}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden p-5">
          <BoardColumns
            boardId={boardId}
            workspaceId={workspaceId}
            board={{ role: b.role, archivedAt: b.archivedAt }}
            lists={lists}
            cards={cards}
            archivedCards={showArchivedCards ? (archivedCards.data ?? []) : []}
            selectedLabelIds={liveSelectedLabelIds}
            dueDateFilter={dueDateFilter}
            assignedToMeUserId={assignedToMeOnly ? currentUserId : null}
            showArchivedLists={showArchivedLists}
            showArchivedCards={showArchivedCards}
            boardLabels={labelList.data ?? boardLabels}
            boardMembers={boardMemberOptions}
            openFirstCardComposerToken={openFirstCardComposerToken}
            openAddListComposerToken={openAddListComposerToken}
          />
        </div>

        {/* Card detail modal — driven by `?card=<id>`; needs a Suspense boundary
            for `useSearchParams` (App Router). */}
        <Suspense fallback={null}>
          <BoardShortcutScope
            enabled
            canEditBoardContent={canEditBoardContent}
            hasActiveList={hasActiveList}
            onOpenBoardSearch={() => setBoardSearchOpen(true)}
            onOpenHelp={() => setShortcutHelpOpen(true)}
            onOpenFirstCardComposer={() => setOpenFirstCardComposerToken((value) => value + 1)}
            onOpenAddListComposer={() => setOpenAddListComposerToken((value) => value + 1)}
          />
          <CardDetailRoute boardId={boardId} />
        </Suspense>
        {/* Lazy `ShortcutHelpDialog` yalnız açıkken mount edilir — kapalıyken
            render edilseydi `next/dynamic` chunk'ı yine indirirdi (DEM-229 #3). */}
        {shortcutHelpOpen && (
          <ShortcutHelpDialog
            open={shortcutHelpOpen}
            onOpenChange={setShortcutHelpOpen}
            includeCardModal={false}
          />
        )}
      </div>
    </div>
  );
}
