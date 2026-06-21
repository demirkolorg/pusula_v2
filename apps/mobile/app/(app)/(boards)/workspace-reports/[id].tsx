/**
 * Faz 13S (DEM-275) — workspace rapor merkezi (mobil).
 *
 * Web `apps/web/src/app/(app)/workspaces/[id]/reports/page.tsx` (13H) ile aynı
 * scope: Kaydedilmiş + Zamanlanmış raporlar. Mobil V1 yalnız **view + indir**
 * — oluştur/zamanla web'de. Tap → `/saved-reports/[id]` WebView panel + PDF
 * share.
 *
 * Veri:
 *   - `report.listSaved({ workspaceId, archived: false })` → kayıtlı.
 *   - `report.schedule.listByWorkspace({ workspaceId })` → zamanlanmış.
 *
 * Pattern: `workspace-members/[id].tsx` (Faz 7D) ile aynı (FlatList +
 * RefreshControl + Stack header + EmptyState). Tab segment'i Pressable bazlı
 * mini segmented control — `BoardViewToggle` paterni (DEM-233) ile akraba.
 * Yeni native bağımlılık yok.
 */
import { useCallback, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { LoadingScreen } from '@/components/loading-screen';
import { ScreenHeader } from '@/components/screen-header';
import { Text } from '@/components/text';
import { formatTimestamp } from '@/lib/format-date';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type SavedReport = RouterOutputs['report']['listSaved']['items'][number];
type ScheduleItem =
  RouterOutputs['report']['schedule']['listByWorkspace']['items'][number];

type Tab = 'saved' | 'scheduled';

function TabSegment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-1 items-center justify-center rounded-md px-3 py-2 ${
        active ? 'bg-card' : 'active:opacity-60'
      }`}
    >
      <Text
        weight={active ? 'semibold' : 'medium'}
        className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function WorkspaceReportsScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const trpc = useTRPC();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('saved');

  const savedQuery = useQuery(
    trpc.report.listSaved.queryOptions(
      { workspaceId, archived: false },
      { enabled: Boolean(workspaceId) && tab === 'saved' },
    ),
  );

  const scheduledQuery = useQuery(
    trpc.report.schedule.listByWorkspace.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) && tab === 'scheduled' },
    ),
  );

  const renderSaved = useCallback<ListRenderItem<SavedReport>>(
    ({ item }) => (
      <ListRow
        title={item.title}
        subtitle={`${strings.reports.scope[item.scopeKind]} · ${formatTimestamp(item.updatedAt)}`}
        leading={
          <View className="h-9 w-9 items-center justify-center rounded-md bg-muted">
            <Icon name="bar-chart-2" size={18} color={theme.mutedForeground} />
          </View>
        }
        onPress={() =>
          router.push({
            pathname: '/saved-reports/[id]',
            params: { id: item.id, workspaceId, title: item.title },
          })
        }
      />
    ),
    [router, theme.mutedForeground, workspaceId],
  );

  const renderScheduled = useCallback<ListRenderItem<ScheduleItem>>(
    ({ item }) => {
      const status = item.schedule.isActive
        ? strings.reports.list.scheduledStatusActive
        : strings.reports.list.scheduledStatusPaused;
      const subtitle = `${status} · ${strings.reports.scope[item.savedReport.scopeKind]}`;
      return (
        <ListRow
          title={item.savedReport.title}
          subtitle={subtitle}
          leading={
            <View className="h-9 w-9 items-center justify-center rounded-md bg-muted">
              <Icon name="clock" size={18} color={theme.mutedForeground} />
            </View>
          }
          onPress={() =>
            router.push({
              pathname: '/saved-reports/[id]',
              params: {
                id: item.savedReport.id,
                workspaceId,
                title: item.savedReport.title,
              },
            })
          }
        />
      );
    },
    [router, theme.mutedForeground, workspaceId],
  );

  const tabSwitcher = (
    <View className="mb-3 mx-4 mt-3 flex-row rounded-lg bg-muted p-1">
      <TabSegment
        label={strings.reports.list.tabs.saved}
        active={tab === 'saved'}
        onPress={() => setTab('saved')}
      />
      <TabSegment
        label={strings.reports.list.tabs.scheduled}
        active={tab === 'scheduled'}
        onPress={() => setTab('scheduled')}
      />
    </View>
  );

  const header = <ScreenHeader title={strings.reports.list.title} />;

  if (!workspaceId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.reports.list.loadError}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  if (tab === 'saved') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {header}
        {tabSwitcher}
        {savedQuery.isPending ? (
          <LoadingScreen />
        ) : savedQuery.isError ? (
          <EmptyState
            icon="alert-triangle"
            title={strings.reports.list.loadError}
            description={savedQuery.error.message || strings.common.unknownError}
          />
        ) : (
          <FlatList
            data={savedQuery.data?.items ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderSaved}
            ListEmptyComponent={
              <View className="px-4 pb-6 pt-6">
                <EmptyState
                  icon="bar-chart-2"
                  title={strings.reports.list.emptySavedTitle}
                  description={strings.reports.list.emptySavedDescription}
                />
              </View>
            }
            contentContainerClassName="gap-2 px-4 pb-6"
            refreshControl={
              <RefreshControl
                refreshing={savedQuery.isFetching && !savedQuery.isPending}
                onRefresh={() => savedQuery.refetch()}
                tintColor={theme.mutedForeground}
              />
            }
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {header}
      {tabSwitcher}
      {scheduledQuery.isPending ? (
        <LoadingScreen />
      ) : scheduledQuery.isError ? (
        <EmptyState
          icon="alert-triangle"
          title={strings.reports.list.loadError}
          description={scheduledQuery.error.message || strings.common.unknownError}
        />
      ) : (
        <FlatList
          data={scheduledQuery.data?.items ?? []}
          keyExtractor={(item) => item.schedule.id}
          renderItem={renderScheduled}
          ListEmptyComponent={
            <View className="px-4 pb-6 pt-6">
              <EmptyState
                icon="clock"
                title={strings.reports.list.emptyScheduledTitle}
                description={strings.reports.list.emptyScheduledDescription}
              />
            </View>
          }
          contentContainerClassName="gap-2 px-4 pb-6"
          refreshControl={
            <RefreshControl
              refreshing={scheduledQuery.isFetching && !scheduledQuery.isPending}
              onRefresh={() => scheduledQuery.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
