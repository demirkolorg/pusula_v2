'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { useBoardRealtime } from '@/lib/realtime/use-board-realtime';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardsColumn } from './_components/home/boards-column';
import { CardsColumn } from './_components/home/cards-column';
import { HomeBreadcrumb } from './_components/home/home-breadcrumb';
import { HomeHero } from './_components/home/home-hero';
import { ListsColumn } from './_components/home/lists-column';
import { useHomeSelection } from './_components/home/use-home-selection';
import { WorkspacesColumn } from './_components/home/workspaces-column';
import type { BoardRow, CardRow, ListRow, WorkspaceRow } from './_components/home/types';
import { OnboardingEmptyState } from './_components/onboarding-empty-state';
import { PendingInvitations } from './_components/pending-invitations';

/**
 * `(app)/` landing — 4-sütun "Gezgin" drill-down (§13.11, karar 2026-06-01).
 * URL-driven: `?ws=&board=&list=` carry column selections; clicking a card in
 * Sütun 4 navigates to the board route (`?card=<id>`) — the detail modal
 * stays single-sourced inside the board context. On `<lg` screens only the
 * deepest selected column is visible, with a tappable breadcrumb above.
 */
export default function WorkspacesPage() {
  const trpc = useTRPC();
  const selection = useHomeSelection();

  // Sütun 1 — workspaces.
  const workspacesQuery = useQuery(trpc.workspace.list.queryOptions());
  const workspaceList: readonly WorkspaceRow[] = workspacesQuery.isSuccess
    ? ((workspacesQuery.data ?? []) as WorkspaceRow[])
    : [];

  // URL'de `ws` yoksa display-fallback ile ilk workspace seçili gibi davran;
  // URL'i zorlamayız (kullanıcı bir seçim yapınca `setWorkspace` üzerinden
  // doğal olarak yazılır).
  const effectiveWorkspaceId =
    selection.workspaceId ?? workspaceList[0]?.id ?? null;
  const selectedWorkspace =
    workspaceList.find((workspace) => workspace.id === effectiveWorkspaceId) ?? null;

  // Sütun 2 — boards of selected workspace.
  const boardsQuery = useQuery({
    ...trpc.board.list.queryOptions({
      workspaceId: effectiveWorkspaceId ?? '__none__',
    }),
    enabled: Boolean(effectiveWorkspaceId),
  });
  const boardList: readonly BoardRow[] =
    boardsQuery.isSuccess && effectiveWorkspaceId
      ? ((boardsQuery.data ?? []) as BoardRow[])
      : [];

  const selectedBoardId = selection.boardId;
  const selectedBoard = boardList.find((board) => board.id === selectedBoardId) ?? null;

  // Sütun 3 + 4 share a single `board.get` payload — yeni endpoint açmıyoruz.
  // Realtime sub için ayrı koşullu mount alt-componenti var (aşağıda); hook'u
  // boş `boardId` ile çağırmıyoruz (W1 düzeltmesi — review code-reviewer).
  const boardGetQuery = useQuery({
    ...trpc.board.get.queryOptions({ boardId: selectedBoardId ?? '__none__' }),
    enabled: Boolean(selectedBoardId),
  });

  const lists: readonly ListRow[] = useMemo(() => {
    if (!selectedBoardId || !boardGetQuery.data) return [];
    return (boardGetQuery.data.lists ?? []) as ListRow[];
  }, [boardGetQuery.data, selectedBoardId]);

  const cards: readonly CardRow[] = useMemo(() => {
    if (!selectedBoardId || !boardGetQuery.data) return [];
    return (boardGetQuery.data.cards ?? []) as CardRow[];
  }, [boardGetQuery.data, selectedBoardId]);

  const selectedListId = selection.listId;
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  /**
   * Drill-down auto-select: her sütun ilk verisi geldiğinde URL'de seçim yoksa
   * ilk öğeyi seçer ve URL'e yazar. Zincir: workspaces → boards → lists →
   * (cards filter otomatik). Setter'lar `useCallback` ile sabit, dep listesi
   * minimal — sonsuz döngü olmaz çünkü `selection.xxxId` set olur olmaz koşul
   * yanlışlanır.
   */
  const { setWorkspace, setBoard, setList } = selection;
  useEffect(() => {
    if (!workspacesQuery.isSuccess) return;
    if (selection.workspaceId) return;
    const first = workspaceList[0];
    if (first) setWorkspace(first.id);
  }, [workspacesQuery.isSuccess, workspaceList, selection.workspaceId, setWorkspace]);
  useEffect(() => {
    if (!boardsQuery.isSuccess || !effectiveWorkspaceId) return;
    if (selection.boardId) return;
    const first = boardList[0];
    if (first) setBoard(first.id);
  }, [
    boardsQuery.isSuccess,
    boardList,
    effectiveWorkspaceId,
    selection.boardId,
    setBoard,
  ]);
  useEffect(() => {
    if (!boardGetQuery.isSuccess || !selectedBoardId) return;
    if (selection.listId) return;
    // Arşivli listeler ilk seçimde atlanır; hepsi arşivliyse ilk öğeye düş.
    const first = lists.find((list) => list.archivedAt == null) ?? lists[0];
    if (first) setList(first.id);
  }, [
    boardGetQuery.isSuccess,
    lists,
    selectedBoardId,
    selection.listId,
    setList,
  ]);

  if (workspacesQuery.isPending) {
    return <AppSpinner label={strings.workspace.loading} showLabel className="justify-start" />;
  }
  if (workspacesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{strings.workspace.loadErrorTitle}</AlertTitle>
        <AlertDescription>
          {workspacesQuery.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  // 0 workspace → onboarding (bootstrap best-effort). Bekleyen davetler de surface'lenir.
  if (workspaceList.length === 0) {
    return (
      <div className="space-y-6">
        <PendingInvitations />
        <OnboardingEmptyState />
      </div>
    );
  }

  // Accordion modu için en derin seçili sütunu hesapla.
  const deepestColumn: 'workspaces' | 'boards' | 'lists' | 'cards' = selectedListId
    ? 'cards'
    : selectedBoardId
      ? 'lists'
      : selection.workspaceId
        ? 'boards'
        : 'workspaces';

  const workspacesColumnEl = (
    <WorkspacesColumn
      workspaces={workspaceList}
      selectedWorkspaceId={effectiveWorkspaceId}
      onSelect={selection.setWorkspace}
    />
  );

  const boardsColumnEl = (
    <BoardsColumn
      workspace={selectedWorkspace}
      boards={boardList}
      selectedBoardId={selectedBoardId}
      onSelect={selection.setBoard}
      onBack={() => selection.setWorkspace(null)}
      isPending={Boolean(effectiveWorkspaceId) && boardsQuery.isPending}
      isError={boardsQuery.isError}
      errorMessage={boardsQuery.error?.message}
    />
  );

  const listsColumnEl = (
    <ListsColumn
      boardId={selectedBoardId}
      lists={lists}
      cards={cards}
      selectedListId={selectedListId}
      onSelect={selection.setList}
      onBack={() => selection.setBoard(null)}
      isPending={Boolean(selectedBoardId) && boardGetQuery.isPending}
      isError={boardGetQuery.isError}
      errorMessage={boardGetQuery.error?.message}
    />
  );

  const cardsColumnEl = (
    <CardsColumn
      workspaceId={effectiveWorkspaceId}
      boardId={selectedBoardId}
      listId={selectedListId}
      cards={cards}
      onBack={() => selection.setList(null)}
      isPending={Boolean(selectedBoardId) && boardGetQuery.isPending}
      isError={boardGetQuery.isError}
      errorMessage={boardGetQuery.error?.message}
    />
  );

  return (
    <div className="relative isolate flex h-[calc(100svh-12rem)] min-h-0 flex-col gap-4">
      {/* Sayfa-geneli dekoratif arka plan: ince dot pattern + tek primary glow.
          Glass sütunların ve hero'nun altında ortak bir doku oluşturur. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="bg-primary/10 absolute left-1/3 top-1/4 size-[28rem] rounded-full blur-3xl" />
      </div>

      {/* Realtime sub yalnız seçili board için aktif — boş id ile mount yok. */}
      {selectedBoardId && <BoardRealtimeMount boardId={selectedBoardId} />}

      <PendingInvitations />

      {/* `<lg` ekranda accordion breadcrumb; `lg+` ekranda gizli. */}
      <HomeBreadcrumb
        className="lg:hidden"
        workspaceName={selectedWorkspace?.name ?? null}
        boardTitle={selectedBoard?.title ?? null}
        listTitle={selectedList?.title ?? null}
        onResetAll={() => selection.setWorkspace(null)}
        onResetToBoards={() => selection.setBoard(null)}
        onResetToLists={() => selection.setList(null)}
      />

      {/* `lg+`: dikey 2 zone — üst 1/3 hero + alt 2/3 sütunlar (4 eşit). */}
      <div className="hidden min-h-0 flex-1 grid-rows-[1fr_2fr] gap-4 lg:grid">
        <HomeHero />
        <div className="grid min-h-0 grid-cols-4 gap-3">
          {workspacesColumnEl}
          {boardsColumnEl}
          {listsColumnEl}
          {cardsColumnEl}
        </div>
      </div>

      {/* `<lg` ekranda yalnız en derin seçili sütun görünür (hero gizli). */}
      <div className="min-h-0 flex-1 lg:hidden">
        {deepestColumn === 'workspaces' && workspacesColumnEl}
        {deepestColumn === 'boards' && boardsColumnEl}
        {deepestColumn === 'lists' && listsColumnEl}
        {deepestColumn === 'cards' && cardsColumnEl}
      </div>
    </div>
  );
}

/**
 * Renders nothing; mounts `useBoardRealtime` for the selected board so the
 * socket join/leave lifecycle aligns with column selection rather than the
 * page mount. Conditional rendering ensures the hook never sees a sentinel
 * empty `boardId`.
 */
function BoardRealtimeMount({ boardId }: { boardId: string }) {
  useBoardRealtime(boardId, { enabled: true });
  return null;
}
