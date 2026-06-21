import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SearchView } from '@/components/search/search-view';
import { strings } from '@/lib/strings';

/**
 * Board içi arama ekranı (Faz 7I) — board ekranı header'ındaki arama
 * butonundan açılır. Arama aktif board kapsamıyla sınırlanır (`boardId`
 * `search.query`'ye geçer; permission filtresi server-side).
 *
 * Başlık ekran-içi `ScreenHeader` ile çizilir ("Pano içinde ara"); geri gitme
 * kenar-kaydırma ile (DEM-206).
 */
export default function BoardSearchScreen() {
  const params = useLocalSearchParams<{ boardId: string }>();
  const boardId = params.boardId;

  // `boardId` bozuk/eksik deep-link'te boş gelebilir.
  if (!boardId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ScreenHeader title={strings.search.boardTitle} />
        <EmptyState
          icon="alert-triangle"
          title={strings.search.unavailableTitle}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.search.boardTitle} />
      <SearchView boardId={boardId} autoFocus />
    </SafeAreaView>
  );
}
