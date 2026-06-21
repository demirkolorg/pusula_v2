import { useCallback, useMemo, useRef } from 'react';
import type { ListRenderItem } from 'react-native';
import {
  FlatList,
  RefreshControl,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { BoardCard } from '@/components/board-card';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

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
  const theme = useTheme();
  const query = useQuery(
    trpc.board.list.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );

  // Board'lar artık zengin kart grid'inde (tek-sütun ListRow yerine). Sütun
  // sayısı cihaza göre: phone & tablet portrait 2, tablet landscape 3 — geniş
  // detail pane'in yatay alanını doldurur (DEM-303 tablet UI iyileştirmesi).
  const isTablet = useIsTablet();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const numColumns = isTablet && viewportWidth > viewportHeight ? 3 : 2;

  // `useRouter` her render'da yeni nesne — board satırı render callback'ini
  // stabil tutmak için ref ile sabitleriz (DEM-226 #3 pattern'iyle uyumlu).
  const routerRef = useRef(router);
  routerRef.current = router;

  // Board'ları `numColumns`'luk satırlara böl (WorkspaceCard grid pattern'i);
  // son satırda eksik hücreler boş `flex-1` View ile doldurularak kartlar
  // tam genişliğe yayılmaz. `numColumns` rotasyonla değişince yeniden bölünür.
  const rows = useMemo<Board[][]>(() => {
    const data = query.data;
    if (!data) return [];
    const out: Board[][] = [];
    for (let i = 0; i < data.length; i += numColumns) {
      out.push(data.slice(i, i + numColumns));
    }
    return out;
  }, [query.data, numColumns]);

  const renderRow = useCallback<ListRenderItem<Board[]>>(
    ({ item: row }) => (
      <View className="flex-row gap-3">
        {row.map((board) => (
          <BoardCard
            key={board.id}
            title={board.title}
            icon={board.icon}
            background={board.background}
            openCount={board.openCount}
            doneCount={board.doneCount}
            archived={Boolean(board.archivedAt)}
            onPress={() =>
              routerRef.current.push({
                pathname: '/boards/[boardId]',
                params: { boardId: board.id, title: board.title },
              })
            }
          />
        ))}
        {/* Son satırdaki eksik hücreler — kartlar grid hizasında kalsın. */}
        {Array.from({ length: numColumns - row.length }).map((_, i) => (
          <View key={`spacer-${i}`} className="flex-1" />
        ))}
      </View>
    ),
    [numColumns],
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
      data={rows}
      keyExtractor={(row) => row[0]!.id}
      contentContainerClassName="gap-3 p-4"
      refreshControl={
        <RefreshControl
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          tintColor={theme.mutedForeground}
        />
      }
      renderItem={renderRow}
    />
  );
}
