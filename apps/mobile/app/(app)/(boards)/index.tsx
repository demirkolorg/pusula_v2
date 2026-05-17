import { FlatList, RefreshControl, View, useColorScheme } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
 * "Panolar" sekmesinin kökü — kullanıcının üye olduğu çalışma alanları.
 * 0 workspace → onboarding empty state (web §8.1.3 simetrisi). Bir satıra
 * dokununca o workspace'in board listesine geçilir.
 *
 * Pull-to-refresh ile yenilenir (7.0 kararı: mobilde realtime yok, yenileme
 * elle tetiklenir).
 */
export default function WorkspacesScreen() {
  const router = useRouter();
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const query = useQuery(trpc.workspace.list.queryOptions());

  const header = <Stack.Screen options={{ title: strings.workspaces.title }} />;

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
          title={strings.workspaces.loadError}
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
          icon="compass"
          title={strings.onboarding.title}
          description={strings.onboarding.description}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <FlatList
        data={query.data}
        keyExtractor={(workspace) => workspace.id}
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
            title={item.name}
            subtitle={`${item.boardCount} ${strings.workspaces.boardCountSuffix} · ${item.memberCount} ${strings.workspaces.memberCountSuffix}`}
            leading={<EntityAvatar name={item.name} />}
            onPress={() =>
              router.push({
                pathname: '/workspaces/[id]',
                params: { id: item.id, name: item.name },
              })
            }
          />
        )}
      />
    </>
  );
}
