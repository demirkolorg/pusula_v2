import { FlatList, Pressable, RefreshControl, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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

  // Header'daki "üyeler" butonu — workspace üye yönetimi ekranına geçer
  // (Faz 7D). `workspaceId` boşsa buton da çizilmez.
  const header = (
    <Stack.Screen
      options={{
        title: params.name ?? strings.tabs.boards,
        headerRight: workspaceId
          ? () => (
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
                className="active:opacity-60"
              >
                <Icon name="users" size={22} color={theme.foreground} />
              </Pressable>
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
        renderItem={({ item }) => (
          <ListRow
            title={item.title}
            subtitle={`${item.openCount} ${strings.boards.openSuffix} · ${item.doneCount} ${strings.boards.doneSuffix}`}
            badge={item.archivedAt ? strings.boards.archivedBadge : undefined}
            leading={<EntityAvatar name={item.title} />}
            onPress={() =>
              router.push({
                pathname: '/boards/[boardId]',
                params: { boardId: item.id, title: item.title },
              })
            }
          />
        )}
      />
    </>
  );
}
