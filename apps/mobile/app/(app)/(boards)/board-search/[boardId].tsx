import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@/components/empty-state';
import { SearchView } from '@/components/search/search-view';
import { strings } from '@/lib/strings';

/**
 * Board içi arama ekranı (Faz 7I) — board ekranı header'ındaki arama
 * butonundan açılır. Arama aktif board kapsamıyla sınırlanır (`boardId`
 * `search.query`'ye geçer; permission filtresi server-side).
 *
 * `(boards)` stack'i içinde olduğundan native header + geri butonu hazır;
 * başlık "Pano içinde ara".
 */
export default function BoardSearchScreen() {
  const params = useLocalSearchParams<{ boardId: string }>();
  const boardId = params.boardId;
  const header = <Stack.Screen options={{ title: strings.search.boardTitle }} />;

  // `boardId` bozuk/eksik deep-link'te boş gelebilir.
  if (!boardId) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.search.unavailableTitle}
          description={strings.common.unknownError}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <SearchView boardId={boardId} autoFocus />
    </>
  );
}
