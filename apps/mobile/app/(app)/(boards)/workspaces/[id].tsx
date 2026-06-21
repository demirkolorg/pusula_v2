import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { WorkspaceBoardsView } from '@/components/workspace-boards-view';
import { WorkspaceHeroHeader } from '@/components/workspace-hero-header';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

/**
 * Bir çalışma alanının board listesi — phone'da tek-kolonlu, deep link
 * üzerinden açılan tablet ziyaretinde de aynı şekilde tek-route gösterilir.
 *
 * Başlık (2026-06-21) hesap alt sayfalarıyla aynı hero çizgisini paylaşan
 * [`WorkspaceHeroHeader`](../../../../src/components/workspace-hero-header.tsx)
 * ile çizilir: ortalanmış workspace ikonu + adı + üye sayısı + "Raporlar /
 * Üyeler" aksiyonları.
 *
 * Faz 15C (DEM-303) öncesi: bu ekran tüm board listesi mantığını içeriyordu.
 * 15C ile board listesi gövdesi [`workspace-boards-view.tsx`](../../../../src/components/workspace-boards-view.tsx)
 * component'ına çıkarıldı; bu dosya yalnız hero başlığını yönetir.
 */
export default function WorkspaceBoardsScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const trpc = useTRPC();

  // Workspace meta'sı (ikon, ad, üye sayısı) hero için. Query yüklenene kadar
  // route param'ından gelen ad + nötr ikonla ilk render dolu gelir.
  const workspaceQuery = useQuery(
    trpc.workspace.get.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );
  const workspace = workspaceQuery.data;

  if (!workspaceId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
      <WorkspaceHeroHeader
        workspaceId={workspaceId}
        title={workspace?.name ?? params.name ?? strings.tabs.boards}
        icon={workspace?.icon}
        memberCount={workspace?.memberCount}
      />
      <WorkspaceBoardsView workspaceId={workspaceId} />
    </SafeAreaView>
  );
}
