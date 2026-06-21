import { useCallback, useRef, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { ScreenHeader } from '@/components/screen-header';
import { Text } from '@/components/text';
import { WorkspaceCard } from '@/components/workspace-card';
import { WorkspaceBoardsView } from '@/components/workspace-boards-view';
import { strings } from '@/lib/strings';
import { useIsTablet } from '@/lib/use-device-class';
import { useTheme } from '@/theme/theme-provider';

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
  const theme = useTheme();
  const query = useQuery(trpc.workspace.list.queryOptions());

  // Faz 15C (DEM-303) — tablet'te workspaces ekranı master-detail: sol sidebar
  // workspace listesi + sağ detail pane seçili workspace'in board listesi.
  const isTablet = useIsTablet();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Tablet detail pane'i açılışta ASLA boş "çalışma alanı seç" durumunda gelmesin:
  // kullanıcı henüz bir seçim yapmadıysa listenin ilkini TÜREVle seç. Effect
  // yerine render-türevi (DEM): effect bir tick gecikir + `useWindowDimensions`
  // ilk render'da `width: 0` döndürünce `isTablet` geçici `false` olur ve
  // effect'in `!isTablet` guard'ı seçimi atlardı → ilk açılışta boş pane (bug).
  // Türev değer ilk render'da dolu gelir, zamanlamadan bağımsızdır.
  const effectiveSelectedId = selectedWorkspaceId ?? query.data?.[0]?.id ?? null;

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
        selected={workspace.id === effectiveSelectedId}
        onPress={() => handleWorkspacePress(workspace)}
      />
    ),
    [handleWorkspacePress, effectiveSelectedId],
  );

  if (query.isPending) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ScreenHeader title={strings.workspaces.title} />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ScreenHeader title={strings.workspaces.title} />
        <EmptyState
          icon="alert-triangle"
          title={strings.workspaces.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button label={strings.common.retry} variant="ghost" onPress={() => query.refetch()} />
          </View>
        </EmptyState>
      </SafeAreaView>
    );
  }

  // Hiç workspace yok: bekleyen davetler hâlâ görünmeli.
  if (query.data.length === 0) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ScreenHeader title={strings.workspaces.title} />
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <PendingInvitations />
          {!isTablet ? (
            <>
              <SectionHeader icon="zap" title={strings.quickNotes.title} />
              <View className="px-4 pb-1">
                <QuickNoteDock />
              </View>
            </>
          ) : null}
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
      </SafeAreaView>
    );
  }

  // Faz 15C (DEM-303) — tablet master-detail.
  if (isTablet) {
    // `query.data.length > 0` yukarıda garanti; türev id geçersizse (ör. seçili
    // workspace silindi) listenin ilkine düş — detail pane hep dolu kalır.
    const selectedWorkspace =
      query.data.find((w) => w.id === effectiveSelectedId) ?? query.data[0];
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ScreenHeader title={strings.workspaces.title} />
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
            // `?? query.data[0]` ile pratikte hep dolu (length>0 garanti); `null`
            // dalı yalnız `noUncheckedIndexedAccess` tipini daraltmak için.
            selectedWorkspace ? (
              <View className="flex-1">
                <View className="border-b border-border px-4 py-3">
                  <Text weight="semibold" className="text-lg text-foreground" numberOfLines={1}>
                    {selectedWorkspace.name}
                  </Text>
                </View>
                <View className="flex-1">
                  <WorkspaceBoardsView workspaceId={selectedWorkspace.id} />
                </View>
              </View>
            ) : null
          }
          sidebarWidth={sidebarWidth}
          testID="workspaces-master-detail"
        />
      </SafeAreaView>
    );
  }

  // Phone: tek sütun liste — her workspace tam genişlik kart.
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.workspaces.title} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <PendingInvitations />
        <SectionHeader icon="zap" title={strings.quickNotes.title} />
        <View className="px-4 pb-1">
          <QuickNoteDock />
        </View>
        <FlatList
          data={query.data}
          keyExtractor={(workspace) => workspace.id}
          contentContainerClassName="gap-3 px-4 pt-3 pb-4"
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
    </SafeAreaView>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-2 pt-3">
      <Icon name={icon as never} size={13} color={theme.primary} />
      <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
    </View>
  );
}
