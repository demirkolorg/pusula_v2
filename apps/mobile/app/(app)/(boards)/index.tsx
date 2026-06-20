import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { MasterDetailLayout } from '@/components/master-detail-layout';
import { Icon } from '@/components/icon';
import { PendingInvitations } from '@/components/pending-invitations';
import { QuickNoteDock } from '@/components/quick-note-dock';
import { Text } from '@/components/text';
import { WorkspaceCard } from '@/components/workspace-card';
import { WorkspaceBoardsView } from '@/components/workspace-boards-view';
import { strings } from '@/lib/strings';
import { useIsTablet } from '@/lib/use-device-class';
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

  // Faz 15C (DEM-303) — tablet'te workspaces ekranı master-detail: sol sidebar
  // workspace listesi + sağ detail pane seçili workspace'in board listesi.
  const isTablet = useIsTablet();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Tablet'te detail pane açılışta boş kalmasın: listenin ilkini otomatik seç.
  useEffect(() => {
    if (!isTablet || selectedWorkspaceId != null) return;
    const first = query.data?.[0];
    if (first) setSelectedWorkspaceId(first.id);
  }, [isTablet, selectedWorkspaceId, query.data]);

  const routerRef = useRef(router);
  routerRef.current = router;
  const isTabletRef = useRef(isTablet);
  isTabletRef.current = isTablet;

  const handleWorkspacePress = useCallback((workspace: Workspace) => {
    if (isTabletRef.current) {
      setSelectedWorkspaceId(workspace.id);
      return;
    }
    routerRef.current.push({
      pathname: '/workspaces/[id]',
      params: { id: workspace.id, name: workspace.name },
    });
  }, []);

  // Phone: tam genişlik liste kartı (tek sütun).
  const renderPhoneItem = useCallback<ListRenderItem<Workspace>>(
    ({ item: workspace }) => (
      <WorkspaceCard
        name={workspace.name}
        icon={workspace.icon}
        role={workspace.role}
        boardCount={workspace.boardCount}
        memberCount={workspace.memberCount}
        lastActivityAt={workspace.lastActivityAt}
        previewBoards={workspace.previewBoards}
        onPress={() => handleWorkspacePress(workspace)}
      />
    ),
    [handleWorkspacePress],
  );

  // Tablet sidebar: kompakt tek-sütun satır.
  const renderTabletItem = useCallback<ListRenderItem<Workspace>>(
    ({ item: workspace }) => (
      <WorkspaceCard
        compact
        name={workspace.name}
        icon={workspace.icon}
        role={workspace.role}
        boardCount={workspace.boardCount}
        memberCount={workspace.memberCount}
        lastActivityAt={workspace.lastActivityAt}
        selected={workspace.id === selectedWorkspaceId}
        onPress={() => handleWorkspacePress(workspace)}
      />
    ),
    [handleWorkspacePress, selectedWorkspaceId],
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

  // Hiç workspace yok: bekleyen davetler hâlâ görünmeli.
  if (query.data.length === 0) {
    return (
      <>
        {header}
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <PendingInvitations />
          {!isTablet ? (
            <>
              <SectionHeader icon="zap" title={strings.quickNotes.title} />
              <QuickNoteDock />
            </>
          ) : null}
          <SectionHeader icon="layout-grid" title={strings.workspaces.title} />
          <ScrollView
            className="flex-1"
            contentContainerClassName="grow gap-4 px-4 pt-2 pb-4"
            refreshControl={
              <RefreshControl
                refreshing={query.isFetching}
                onRefresh={() => query.refetch()}
                tintColor={theme.mutedForeground}
              />
            }
          >
            <View className="grow justify-center">
              <EmptyState
                icon="compass"
                title={strings.onboarding.title}
                description={strings.onboarding.description}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </>
    );
  }

  // Faz 15C (DEM-303) — tablet master-detail.
  if (isTablet) {
    const selectedWorkspace =
      selectedWorkspaceId != null
        ? (query.data.find((w) => w.id === selectedWorkspaceId) ?? null)
        : null;
    return (
      <>
        {header}
        <MasterDetailLayout
          master={
            <FlatList
              data={query.data}
              keyExtractor={(workspace) => workspace.id}
              ListHeaderComponent={PendingInvitations}
              contentContainerClassName="gap-3 p-3"
              refreshControl={
                <RefreshControl
                  refreshing={query.isFetching}
                  onRefresh={() => query.refetch()}
                  tintColor={theme.mutedForeground}
                />
              }
              renderItem={renderTabletItem}
            />
          }
          detail={
            selectedWorkspace ? (
              <View className="flex-1">
                <View className="border-b border-border px-4 py-3">
                  <Text
                    weight="semibold"
                    className="text-lg text-foreground"
                    numberOfLines={1}
                  >
                    {selectedWorkspace.name}
                  </Text>
                </View>
                <View className="flex-1">
                  <WorkspaceBoardsView workspaceId={selectedWorkspace.id} />
                </View>
              </View>
            ) : (
              <EmptyState
                icon="compass"
                title={strings.workspaces.detailEmptyTitle}
                description={strings.workspaces.detailEmptyDescription}
              />
            )
          }
          sidebarWidth={sidebarWidth}
          testID="workspaces-master-detail"
        />
      </>
    );
  }

  // Phone: tek sütun liste — her workspace tam genişlik kart.
  return (
    <>
      {header}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <PendingInvitations />
        <SectionHeader icon="zap" title={strings.quickNotes.title} />
        <QuickNoteDock />
        <SectionHeader icon="layout-grid" title={strings.workspaces.title} />
        <FlatList
          data={query.data}
          keyExtractor={(workspace) => workspace.id}
          contentContainerClassName="gap-3 px-4 pt-2 pb-4"
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={renderPhoneItem}
        />
      </KeyboardAvoidingView>
    </>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-2 pt-3">
      <Icon name={icon as never} size={13} color={theme.mutedForeground} />
      <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
    </View>
  );
}
