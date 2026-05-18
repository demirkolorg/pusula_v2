import { useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { BoardColumn } from '@/components/board-column';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ListActionsSheet } from '@/components/list-actions-sheet';
import { ListAddColumn } from '@/components/list-add-column';
import { LoadingScreen } from '@/components/loading-screen';
import { MoveToListSheet } from '@/components/move-to-list-sheet';
import type { BoardCard, BoardList } from '@/lib/board-cache';
import { isPendingId } from '@/lib/client-mutation-id';
import { canEditBoard } from '@/lib/member-roles';
import { strings } from '@/lib/strings';
import { useBoardMutations } from '@/lib/use-board-mutations';
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
export default function BoardScreen() {
  const params = useLocalSearchParams<{ boardId: string; title?: string }>();
  const boardId = params.boardId;
  const trpc = useTRPC();
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  const query = useQuery(
    trpc.board.get.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );
  const mutations = useBoardMutations(boardId);

  // "move to list" picker ve kolon ⋮ menüsü için seçili hedefler.
  const [moveTarget, setMoveTarget] = useState<BoardCard | null>(null);
  const [listActionsTarget, setListActionsTarget] = useState<BoardList | null>(null);

  // Header aksiyonları — board içi arama (Faz 7I) + board üye yönetimi (Faz 7D).
  const header = (
    <Stack.Screen
      options={{
        title: params.title ?? strings.board.fallbackTitle,
        headerRight: boardId
          ? () => (
              <View className="flex-row items-center gap-4">
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
                      params: { boardId, title: params.title ?? '' },
                    })
                  }
                  className="active:opacity-60"
                >
                  <Icon name="users" size={22} color={theme.foreground} />
                </Pressable>
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

  return (
    <>
      {header}
      <ScrollView
        horizontal
        className="flex-1"
        contentContainerClassName="gap-3 p-3"
        showsHorizontalScrollIndicator={false}
      >
        {activeLists.map((list) => (
          <BoardColumn
            key={list.id}
            list={list}
            cards={query.data.cards.filter((card) => card.listId === list.id)}
            canEdit={canEdit}
            onCreateCard={(title) => mutations.createCard(list.id, title)}
            onOpenListActions={() => setListActionsTarget(list)}
            onMoveCard={(card) => setMoveTarget(card)}
            refreshing={query.isFetching}
            onRefresh={() => void query.refetch()}
          />
        ))}
        {canEdit ? <ListAddColumn onCreate={mutations.createList} /> : null}
      </ScrollView>

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
    </>
  );
}
