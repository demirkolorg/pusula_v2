import { useCallback, useMemo, useRef, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, RefreshControl, ScrollView, View, useColorScheme } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { PendingInvitations } from '@/components/pending-invitations';
import { QuickNoteDock } from '@/components/quick-note-dock';
import { WorkspaceCard } from '@/components/workspace-card';
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
type Workspace = RouterOutputs['workspace']['list'][number];

export default function WorkspacesScreen() {
  const router = useRouter();
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const query = useQuery(trpc.workspace.list.queryOptions());

  const header = <Stack.Screen options={{ title: strings.workspaces.title }} />;

  // Alta sabitlenen hızlı-not dock'unun ölçülen yüksekliği — kaydırılan
  // içeriğe bu kadar alt boşluk verilir ki son satır dock'un arkasında
  // gizli kalmasın (içerik dock'un altından kayar — DEM-230).
  const [dockHeight, setDockHeight] = useState(0);

  // İki sütunlu grid satırları — `useMemo` ile bir kez bölünür (DEM-226 #3);
  // önceden her render'da `for` döngüsüyle yeniden üretiliyordu.
  const rows = useMemo<Workspace[][]>(() => {
    const data = query.data;
    if (!data) return [];
    const out: Workspace[][] = [];
    for (let i = 0; i < data.length; i += 2) {
      out.push(data.slice(i, i + 2));
    }
    return out;
  }, [query.data]);

  // `useRouter` her render'da yeni nesne döndürür — ref üzerinden okuyarak
  // satır render callback'ini stabil tutarız (DEM-226 #3).
  const routerRef = useRef(router);
  routerRef.current = router;

  // Satır render'ı — `useCallback` ile stabil (DEM-226 #3).
  const renderRow = useCallback<ListRenderItem<Workspace[]>>(
    ({ item: row }) => (
      <View className="flex-row gap-3">
        {row.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            name={workspace.name}
            icon={workspace.icon}
            role={workspace.role}
            boardCount={workspace.boardCount}
            memberCount={workspace.memberCount}
            onPress={() =>
              routerRef.current.push({
                pathname: '/workspaces/[id]',
                params: { id: workspace.id, name: workspace.name },
              })
            }
          />
        ))}
        {row.length === 1 ? <View className="flex-1" /> : null}
      </View>
    ),
    [],
  );

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

  // Hiç workspace yok: bekleyen davetler hâlâ görünmeli (davet kabul edilince
  // ilk workspace bu yoldan gelir). Davet varsa scroll'lu liste + onboarding
  // boş durumu; davet yoksa salt onboarding.
  if (query.data.length === 0) {
    return (
      <>
        {header}
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow gap-4 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: dockHeight + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
        >
          <PendingInvitations />
          <View className="grow justify-center">
            <EmptyState
              icon="compass"
              title={strings.onboarding.title}
              description={strings.onboarding.description}
            />
          </View>
        </ScrollView>
        <QuickNoteDock onHeightChange={setDockHeight} />
      </>
    );
  }

  // İki sütunlu grid: workspace'ler ikişerli satırlara bölünür (yukarıda
  // `rows` memo'su); tek kalan workspace satırın sol yarısında kalır.
  return (
    <>
      {header}
      <FlatList
        data={rows}
        keyExtractor={(row) => row[0]!.id}
        ListHeaderComponent={PendingInvitations}
        contentContainerClassName="gap-3 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: dockHeight + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
            tintColor={theme.mutedForeground}
          />
        }
        renderItem={renderRow}
      />
      <QuickNoteDock onHeightChange={setDockHeight} />
    </>
  );
}
