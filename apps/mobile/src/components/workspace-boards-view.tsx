import { useCallback, useRef } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, RefreshControl, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { EntityAvatar } from '@/components/entity-avatar';
import { ListRow } from '@/components/list-row';
import { LoadingScreen } from '@/components/loading-screen';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type Board = RouterOutputs['board']['list'][number];

export interface WorkspaceBoardsViewProps {
  /** İçeriği yüklenecek workspace id'si. Boş string → "Workspace seçilmedi" boş durumu. */
  workspaceId: string;
}

/**
 * Faz 15C (DEM-303) — bir workspace'in board listesi gövdesi (header'sız).
 *
 * Tek başına bir Stack.Screen render etmez — tüketici route veya
 * master-detail detail pane Stack/inline header'ı yönetir. Bu sayede aynı
 * görsel hem `workspaces/[id]` route'unda (Stack.Screen + WorkspaceBoardsView)
 * hem de `(boards)/index.tsx` tablet master-detail sağ pane'inde inline
 * header üstünde aynı içerik olarak görünür.
 *
 * Pull-to-refresh ile board listesi yeniden çekilir (7.0: mobilde realtime
 * yok, elle yenileme). Board tıklanınca mevcut `boards/[boardId]` route'una
 * push — tablet'te board ekranı kendi master-detail'ini açar (15C.2).
 */
export function WorkspaceBoardsView({ workspaceId }: WorkspaceBoardsViewProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const query = useQuery(
    trpc.board.list.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );

  // `useRouter` her render'da yeni nesne — board satırı render callback'ini
  // stabil tutmak için ref ile sabitleriz (DEM-226 #3 pattern'iyle uyumlu).
  const routerRef = useRef(router);
  routerRef.current = router;

  const renderBoard = useCallback<ListRenderItem<Board>>(
    ({ item }) => (
      <ListRow
        title={item.title}
        subtitle={`${item.openCount} ${strings.boards.openSuffix} · ${item.doneCount} ${strings.boards.doneSuffix}`}
        badge={item.archivedAt ? strings.boards.archivedBadge : undefined}
        leading={<EntityAvatar name={item.title} icon={item.icon} />}
        onPress={() =>
          routerRef.current.push({
            pathname: '/boards/[boardId]',
            params: { boardId: item.id, title: item.title },
          })
        }
      />
    ),
    [],
  );

  if (!workspaceId) {
    return (
      <EmptyState
        icon="compass"
        title={strings.onboarding.title}
        description={strings.onboarding.description}
      />
    );
  }

  if (query.isPending) {
    return <LoadingScreen />;
  }

  if (query.isError) {
    return (
      <EmptyState
        icon="alert-triangle"
        title={strings.boards.loadError}
        description={strings.common.unknownError}
      >
        <View className="w-40">
          <Button
            label={strings.common.retry}
            variant="ghost"
            onPress={() => query.refetch()}
          />
        </View>
      </EmptyState>
    );
  }

  if (query.data.length === 0) {
    return (
      <EmptyState
        icon="trello"
        title={strings.boards.emptyTitle}
        description={strings.boards.emptyDescription}
      />
    );
  }

  return (
    <FlatList
      data={query.data}
      keyExtractor={(board) => board.id}
      contentContainerClassName="gap-3 p-4"
      refreshControl={
        <RefreshControl
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          tintColor={theme.mutedForeground}
        />
      }
      renderItem={renderBoard}
    />
  );
}
