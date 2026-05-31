import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { BoardActionsSheet } from '@/components/board-actions-sheet';
import { BoardColumn } from '@/components/board-column';
import { BoardListView } from '@/components/board-list-view';
import { BoardSidebar } from '@/components/board-sidebar';
import { BoardViewToggle } from '@/components/board-view-toggle';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LabelFilterSheet } from '@/components/label-filter-sheet';
import { ListActionsSheet } from '@/components/list-actions-sheet';
import { ListAddColumn } from '@/components/list-add-column';
import { LoadingScreen } from '@/components/loading-screen';
import { MasterDetailLayout } from '@/components/master-detail-layout';
import { MoveToListSheet } from '@/components/move-to-list-sheet';
import { Text } from '@/components/text';
import type { BoardCard, BoardList } from '@/lib/board-cache';
import { cardPassesLabelFilter } from '@/lib/board-filter';
import { isPendingId } from '@/lib/client-mutation-id';
import { canEditBoard, canManageBoard } from '@/lib/member-roles';
import { strings } from '@/lib/strings';
import { useBoardMutations } from '@/lib/use-board-mutations';
import { useBoardViewMode } from '@/lib/use-board-view-mode';
import { useDownloadBoardReport } from '@/lib/use-download-board-report';
import { useIsTablet } from '@/lib/use-device-class';
import { themeFor } from '@/theme/tokens';

/**
 * Board ekranı — Faz 7E salt-okunur kurdu, Faz 7H board `member+` için
 * yazılabilir yaptı. `board.get` ile listeleri yatay kaydıran kolonlar,
 * kartları kolon içinde dikey render eder. Board adı header'a route query
 * parametresiyle (`?title=`) taşınır.
 *
 * Faz 7H düzenleme yüzeyleri (yalnız `canEdit` — board `member+`): kolon altı
 * kart-ekle composer'ı (`card.create`), şerit sonundaki "Liste ekle" kolonu
 * (`list.create`), kolon ⋮ menüsü (`list.update` / `list.archive`), kart uzun
 * basma → "move to list" picker (`card.moveToList`). Hepsi optimistic UI +
 * rollback + `clientMutationId` (bkz. `useBoardMutations`).
 */
/**
 * Kartsız kolonlar için stabil boş dizi referansı — her render'da yeni `[]`
 * üretmek `BoardColumn`'un `React.memo`'sunu kırardı (DEM-226 #2).
 */
const EMPTY_CARDS: BoardCard[] = [];

export default function BoardScreen() {
  const params = useLocalSearchParams<{ boardId: string; title?: string }>();
  const boardId = params.boardId;
  const trpc = useTRPC();
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  // Faz 15C (DEM-303) — tablet'te board ekranı master-detail: sol BoardSidebar
  // + sağ kanban/listview. Phone'da değişmez (mevcut tek-kolonlu akış).
  // Sidebar genişliği `13-ui-tasarim-dili.md` §13.12.1: portrait `w-80` (320),
  // landscape `w-96` (384). `useWindowDimensions` rotation duyarlı; rotate
  // sonrası genişlik tek render'da güncellenir.
  const isTablet = useIsTablet();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  const query = useQuery(
    trpc.board.get.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );
  const mutations = useBoardMutations(boardId);
  // Görünüm modu (DEM-233) — kanban kolon / dikey liste. Global + kalıcı tercih.
  const { mode: viewMode, setMode: setViewMode } = useBoardViewMode();
  // Faz 14F (DEM-296) — klasik pano PDF indir/paylaş; board ⋮ menüsünden tetiklenir.
  const { download: downloadReport, isDownloading: isDownloadingReport } =
    useDownloadBoardReport(boardId, query.data?.board.title);
  // `useBoardMutations` her render'da yeni nesne döndürür — kolonlara geçen
  // handler'ları stabil tutmak için ref üzerinden okuruz (DEM-226 #2/#3).
  const mutationsRef = useRef(mutations);
  mutationsRef.current = mutations;

  // "move to list" picker ve kolon ⋮ menüsü için seçili hedefler.
  const [moveTarget, setMoveTarget] = useState<BoardCard | null>(null);
  const [listActionsTarget, setListActionsTarget] = useState<BoardList | null>(null);

  // Board ⋮ menüsü (DEM-211 — yeniden adlandır / arşivle).
  const [boardActionsOpen, setBoardActionsOpen] = useState(false);
  // Nav başlığı tek kaynaktan: `board.get` cache'i. Yeniden adlandırma optimistic
  // olarak bu cache'i yamalar (anında güncel) ve hata olursa rollback başlığı da
  // geri alır; `board.get` henüz yüklenmediyse route query (`?title=`) fallback.
  const displayTitle =
    query.data?.board.title ?? params.title ?? strings.board.fallbackTitle;

  // Etiket filtresi (Faz 7E-2) — geçici istemci-tarafı state; ekran değişince
  // sıfırlanır. Seçili etiketlerden en az birini taşıyan kartlar gösterilir.
  // Not: başka bir istemci seçili bir etiketi silerse id state'te "stale"
  // kalabilir (rozet sayısı sheet'le uyuşmaz) — web istemci-tarafı filtresiyle
  // aynı kabul edilen sınır; "Tümünü temizle" ile çözülür.
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<string>>(new Set());

  const toggleLabelFilter = (labelId: string) =>
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });

  // Kartları kolon başına bir kez grupla + etiket filtresinden geçir (DEM-226
  // #4). Önceden her render'da her kolon için `cards.filter(listId)` +
  // `filterCardsByLabels` çağrılıyordu (O(liste×kart)); artık tek geçişte
  // `Map<listId, BoardCard[]>` üretiliyor ve kolonlar bu map'ten okuyor.
  // `board.get` zaten `position` sıralı döndürür — tek geçiş sırayı korur.
  const cardsByList = useMemo(() => {
    const map = new Map<string, BoardCard[]>();
    if (!query.data) return map;
    for (const card of query.data.cards) {
      if (!cardPassesLabelFilter(card, selectedLabelIds)) continue;
      const bucket = map.get(card.listId);
      if (bucket) bucket.push(card);
      else map.set(card.listId, [card]);
    }
    return map;
  }, [query.data, selectedLabelIds]);

  // Kolonlara geçen stabil handler'lar (DEM-226 #3) — `BoardColumn` `React.memo`
  // olduğundan referansları her render'da sabit kalmalı. Mutation'lar ref
  // üzerinden okunur; `setMoveTarget`/`setListActionsTarget` zaten stabildir.
  const handleCreateCard = useCallback((listId: string, title: string) => {
    mutationsRef.current.createCard(listId, title);
  }, []);
  const handleOpenListActions = useCallback((list: BoardList) => {
    setListActionsTarget(list);
  }, []);
  const handleMoveCard = useCallback((card: BoardCard) => {
    setMoveTarget(card);
  }, []);
  const refetchBoard = query.refetch;
  const handleRefresh = useCallback(() => {
    void refetchBoard();
  }, [refetchBoard]);

  // Board ⋮ menüsü yalnız board `admin` ve board arşivli değilken çizilir
  // (DEM-211 — DEM-196 kart ⋮ görünürlük deseninin board karşılığı).
  const canManageThisBoard =
    query.data != null &&
    canManageBoard(query.data.board.role) &&
    query.data.board.archivedAt == null;

  // Board arşivleme — `Alert` ile onayla, optimistic mutation tetikle, board
  // listesine geri dön (arşivlenen board listede salt-okunur görünür).
  function handleArchiveBoard() {
    setBoardActionsOpen(false);
    Alert.alert(
      strings.board.archiveBoardConfirmTitle,
      strings.board.archiveBoardConfirmBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.board.archiveBoardConfirmAction,
          style: 'destructive',
          onPress: () => {
            mutations.archiveBoard();
            router.back();
          },
        },
      ],
    );
  }

  // Header aksiyonları — board içi arama (Faz 7I) + board üye yönetimi (Faz 7D)
  // + board ⋮ işlemler menüsü (DEM-211).
  const header = (
    <Stack.Screen
      options={{
        title: displayTitle,
        headerRight: boardId
          ? () => (
              <View className="flex-row items-center gap-4">
                {/* Görünüm modu (DEM-233) — kanban kolon / dikey liste; yalnız
                    board yüklendiğinde gösterilir (mod seçimi içerikle anlamlı). */}
                {query.data ? (
                  <BoardViewToggle mode={viewMode} onChange={setViewMode} />
                ) : null}
                {/* Etiket filtresi — yalnız board yüklendiğinde (sheet de o an mount). */}
                {query.data ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.boardFilter.headerLabel}
                    accessibilityState={{ selected: selectedLabelIds.size > 0 }}
                    hitSlop={8}
                    onPress={() => setFilterOpen(true)}
                    className="active:opacity-60"
                  >
                    <Icon
                      name="filter"
                      size={21}
                      color={selectedLabelIds.size > 0 ? theme.primary : theme.foreground}
                    />
                    {selectedLabelIds.size > 0 ? (
                      <View className="absolute -right-2 -top-1.5 min-w-4 items-center rounded-full bg-primary px-1">
                        <Text weight="semibold" className="text-[10px] text-primary-foreground">
                          {selectedLabelIds.size}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.search.boardTitle}
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/board-search/[boardId]',
                      params: { boardId },
                    })
                  }
                  className="active:opacity-60"
                >
                  <Icon name="search" size={21} color={theme.foreground} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.members.boardTitle}
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/board-members/[boardId]',
                      params: { boardId, title: displayTitle },
                    })
                  }
                  className="active:opacity-60"
                >
                  <Icon name="users" size={22} color={theme.foreground} />
                </Pressable>
                {/* Board ⋮ işlemler — yalnız board admin + arşivli değilken. */}
                {canManageThisBoard ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.board.boardActionsLabel}
                    hitSlop={8}
                    onPress={() => setBoardActionsOpen(true)}
                    className="active:opacity-60"
                  >
                    <Icon name="more-vertical" size={22} color={theme.foreground} />
                  </Pressable>
                ) : null}
              </View>
            )
          : undefined,
      }}
    />
  );

  if (!boardId) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.board.loadError}
          description={strings.common.unknownError}
        />
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {header}
        <LoadingScreen />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.board.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button label={strings.common.retry} variant="ghost" onPress={() => query.refetch()} />
          </View>
        </EmptyState>
      </>
    );
  }

  const canEdit = canEditBoard(query.data.board.role);
  // Arşivli listeler board görünümünde gizlenir.
  const activeLists = query.data.lists.filter((list) => list.archivedAt == null);

  // Salt-okunur kullanıcıda boş board → bilgilendirici boş durum (7E davranışı).
  // `member+` ise boş board'da bile "Liste ekle" kolonu gösterilir.
  if (activeLists.length === 0 && !canEdit) {
    return (
      <>
        {header}
        <EmptyState
          icon="trello"
          title={strings.board.emptyTitle}
          description={strings.board.emptyDescription}
        />
      </>
    );
  }

  // Sağ pane / phone içeriği — kanban kolonları veya dikey liste görünümü.
  // Master-detail tablet branch'i bu içeriği sağ pane'de gösterir; phone'da
  // ekranın tamamını kaplar.
  const mainContent =
    viewMode === 'kanban' ? (
      <ScrollView
        horizontal
        className="flex-1"
        contentContainerClassName="gap-3 p-3"
        showsHorizontalScrollIndicator={false}
        // Faz 15B (DEM-302): iPad'de safe-area/notch için yatay
        // contentInset'in orientation değişimlerinde recalc edilmesini sağlar.
        contentInsetAdjustmentBehavior="automatic"
      >
        {activeLists.map((list) => (
          <BoardColumn
            key={list.id}
            list={list}
            cards={cardsByList.get(list.id) ?? EMPTY_CARDS}
            canEdit={canEdit}
            onCreateCard={handleCreateCard}
            onOpenListActions={handleOpenListActions}
            onMoveCard={handleMoveCard}
            refreshing={query.isFetching}
            onRefresh={handleRefresh}
          />
        ))}
        {canEdit ? <ListAddColumn onCreate={mutations.createList} /> : null}
      </ScrollView>
    ) : (
      <BoardListView
        lists={activeLists}
        cardsByList={cardsByList}
        canEdit={canEdit}
        onCreateCard={handleCreateCard}
        onCreateList={mutations.createList}
        onOpenListActions={handleOpenListActions}
        onMoveCard={handleMoveCard}
        refreshing={query.isFetching}
        onRefresh={handleRefresh}
      />
    );

  // Tablet master-detail: sol BoardSidebar + sağ `mainContent`. Phone'da
  // sidebar render edilmez — wrapper'ı atlayıp `mainContent`'i doğrudan
  // çizeriz (görünmeyen master pane'i mount etmemek için; DEM-303 15C.2).
  const body = isTablet ? (
    <MasterDetailLayout
      master={<BoardSidebar lists={activeLists} cardsByList={cardsByList} />}
      detail={mainContent}
      sidebarWidth={sidebarWidth}
      testID="board-master-detail"
    />
  ) : (
    mainContent
  );

  return (
    <>
      {header}
      {body}

      <MoveToListSheet
        visible={moveTarget != null}
        // Optimistic (henüz yazılmamış) listeler taşıma hedefi olamaz.
        lists={activeLists.filter((list) => !isPendingId(list.id))}
        currentListId={moveTarget?.listId ?? ''}
        onSelect={(listId) => {
          if (moveTarget) mutations.moveCard(moveTarget.id, listId);
          setMoveTarget(null);
        }}
        onClose={() => setMoveTarget(null)}
      />

      <ListActionsSheet
        visible={listActionsTarget != null}
        list={listActionsTarget}
        onRename={(title) => {
          if (listActionsTarget) mutations.renameList(listActionsTarget.id, title);
          setListActionsTarget(null);
        }}
        onArchive={() => {
          if (listActionsTarget) mutations.archiveList(listActionsTarget.id);
          setListActionsTarget(null);
        }}
        onClose={() => setListActionsTarget(null)}
      />

      <LabelFilterSheet
        visible={filterOpen}
        boardId={boardId}
        selectedLabelIds={selectedLabelIds}
        onToggle={toggleLabelFilter}
        onClear={() => setSelectedLabelIds(new Set())}
        onClose={() => setFilterOpen(false)}
      />

      {/* DEM-211 — board ⋮ menüsü: yeniden adlandır / arşivle. */}
      <BoardActionsSheet
        visible={boardActionsOpen}
        boardTitle={displayTitle}
        onRename={(title) => {
          // `renameBoard` `board.get` cache'ini optimistic yamalar → nav başlığı
          // (`displayTitle`) anında güncellenir; ayrı bir local state gerekmez.
          mutations.renameBoard(title);
          setBoardActionsOpen(false);
        }}
        onArchive={handleArchiveBoard}
        onDownloadReport={() => {
          void downloadReport();
        }}
        downloadReportPending={isDownloadingReport}
        onClose={() => setBoardActionsOpen(false)}
      />
    </>
  );
}
