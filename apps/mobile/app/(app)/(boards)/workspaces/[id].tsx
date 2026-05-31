import { Pressable, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { WorkspaceBoardsView } from '@/components/workspace-boards-view';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Bir çalışma alanının board listesi — phone'da tek-kolonlu, deep link
 * üzerinden açılan tablet ziyaretinde de aynı şekilde tek-route gösterilir.
 *
 * Faz 15C (DEM-303) öncesi: bu ekran tüm board listesi mantığını içeriyordu.
 * 15C ile board listesi gövdesi [`workspace-boards-view.tsx`](../../../../src/components/workspace-boards-view.tsx)
 * component'ına çıkarıldı — `(boards)/index.tsx` tablet master-detail sağ
 * pane'i aynı component'ı render eder, route header'ı bu dosya yönetir.
 *
 * Header'daki "Raporlar" (Faz 13S / DEM-275) + "Üyeler" (Faz 7D) butonları
 * 44×44 Apple HIG dokunma alanı disiplinini korur.
 */
export default function WorkspaceBoardsScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const theme = themeFor(useColorScheme());

  const header = (
    <Stack.Screen
      options={{
        title: params.name ?? strings.tabs.boards,
        headerRight: workspaceId
          ? () => (
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

  return (
    <>
      {header}
      <WorkspaceBoardsView workspaceId={workspaceId} />
    </>
  );
}
