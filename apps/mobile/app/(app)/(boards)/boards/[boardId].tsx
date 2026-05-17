import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { BoardColumn } from '@/components/board-column';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { strings } from '@/lib/strings';

/**
 * Board ekranı — salt-okunur (Faz 7E). `board.get` ile listeleri yatay
 * kaydıran kolonlar, kartları kolon içinde dikey render eder. Board adı
 * header'a route query parametresiyle (`?title=`) taşınır.
 *
 * Drag-drop kapsam dışı (kart taşıma 7H); kart detayına dokunma 7F.
 */
export default function BoardScreen() {
  const params = useLocalSearchParams<{ boardId: string; title?: string }>();
  const boardId = params.boardId;
  const trpc = useTRPC();
  const query = useQuery(
    trpc.board.get.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );

  const header = (
    <Stack.Screen options={{ title: params.title ?? strings.board.fallbackTitle }} />
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

  // Arşivli listeler salt-okunur board görünümünde gizlenir.
  const activeLists = query.data.lists.filter((list) => list.archivedAt == null);

  if (activeLists.length === 0) {
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
          />
        ))}
      </ScrollView>
    </>
  );
}
