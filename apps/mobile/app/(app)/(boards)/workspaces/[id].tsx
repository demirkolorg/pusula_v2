import { Alert, FlatList, RefreshControl, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { EntityAvatar } from '@/components/entity-avatar';
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
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  // `workspaceId` runtime'da (bozuk/eksik deep-link) boş gelebilir — tip
  // `string` dese de query'yi `enabled` ile o durumda hiç tetikleme.
  const query = useQuery(
    trpc.board.list.queryOptions({ workspaceId }, { enabled: Boolean(workspaceId) }),
  );

  const header = (
    <Stack.Screen options={{ title: params.name ?? strings.tabs.boards }} />
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
            onPress={() => Alert.alert(strings.boards.comingSoonTitle, strings.boards.comingSoonBody)}
          />
        )}
      />
    </>
  );
}
