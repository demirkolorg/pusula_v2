import { useCallback, useRef } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, Pressable, RefreshControl, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { LoadingScreen } from '@/components/loading-screen';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Bir çalışma alanının board listesi. Workspace adı header'a route query
 * parametresi (`?name=`) ile taşınır — ekstra fetch yok.
 *
 * 7C'de board satırına dokunmak "yakında" bilgilendirmesi gösterir; gerçek
 * board ekranı (kolon/kart) Faz 7E.
 */
type Board = RouterOutputs['board']['list'][number];

export default function WorkspaceBoardsScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  // `workspaceId` runtime'da (bozuk/eksik deep-link) boş gelebilir — tip
  // `string` dese de query'yi `enabled` ile o durumda hiç tetikleme.
  const query = useQuery(
    trpc.board.list.queryOptions({ workspaceId }, { enabled: Boolean(workspaceId) }),
  );

  // `useRouter` her render'da yeni nesne — ref ile sabitleyip board satırı
  // render callback'ini stabil tutarız (DEM-226 #3).
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

  // Header'daki "üyeler" butonu — workspace üye yönetimi ekranına geçer
  // (Faz 7D). `workspaceId` boşsa buton da çizilmez.
  const header = (
    <Stack.Screen
      options={{
        title: params.name ?? strings.tabs.boards,
        headerRight: workspaceId
          ? () => (
              // 44×44 sabit alan — Apple HIG min dokunma; ikon dikey/yatay ortalı,
              // başlıkla görsel dengeli (DEM-237). `hitSlop` ekstra güvenlik.
              // Faz 13S (DEM-275) — Raporlar girişi üye yönetimi butonunun
              // hemen solunda; aynı 44×44 disiplin. Mobil V1: yalnız view +
              // indir (oluştur/zamanla web'de).
              <View className="flex-row items-center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.reports.workspaceLinkLabel}
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/workspace-reports/[id]',
                      params: { id: workspaceId, name: params.name ?? '' },
                    })
                  }
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Icon name="bar-chart-2" size={20} color={theme.foreground} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.members.workspaceTitle}
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/workspace-members/[id]',
                      params: { id: workspaceId, name: params.name ?? '' },
                    })
                  }
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Icon name="users" size={20} color={theme.foreground} />
                </Pressable>
              </View>
            )
          : undefined,
      }}
    />
  );

  if (!workspaceId) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.boards.loadError}
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
          title={strings.boards.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button label={strings.common.retry} variant="ghost" onPress={() => query.refetch()} />
          </View>
        </EmptyState>
      </>
    );
  }

  if (query.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="trello"
          title={strings.boards.emptyTitle}
          description={strings.boards.emptyDescription}
        />
      </>
    );
  }

  return (
    <>
      {header}
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
    </>
  );
}
