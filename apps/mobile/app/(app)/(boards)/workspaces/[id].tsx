import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader, ScreenHeaderAction } from '@/components/screen-header';
import { WorkspaceBoardsView } from '@/components/workspace-boards-view';
import { strings } from '@/lib/strings';

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
 * ekran-içi `ScreenHeader` aksiyonlarıdır (2026-06-21 native header kaldırıldı).
 */
export default function WorkspaceBoardsScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const router = useRouter();

  const header = (
    <ScreenHeader
      title={params.name ?? strings.tabs.boards}
      right={
        workspaceId ? (
          <>
            <ScreenHeaderAction
              icon="bar-chart-2"
              accessibilityLabel={strings.reports.workspaceLinkLabel}
              onPress={() =>
                router.push({
                  pathname: '/workspace-reports/[id]',
                  params: { id: workspaceId, name: params.name ?? '' },
                })
              }
            />
            <ScreenHeaderAction
              icon="users"
              accessibilityLabel={strings.members.workspaceTitle}
              onPress={() =>
                router.push({
                  pathname: '/workspace-members/[id]',
                  params: { id: workspaceId, name: params.name ?? '' },
                })
              }
            />
          </>
        ) : undefined
      }
    />
  );

  if (!workspaceId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.boards.loadError}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {header}
      <WorkspaceBoardsView workspaceId={workspaceId} />
    </SafeAreaView>
  );
}
