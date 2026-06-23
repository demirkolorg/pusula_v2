import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SearchView } from '@/components/search/search-view';
import { strings } from '@/lib/strings';

/**
 * "Arama" sekmesi — global arama (Faz 7I). Tüm erişilebilir workspace/board
 * kapsamında pano/liste/kart/yorum/etiket/ek araması; permission filtresi
 * `search.query` (Faz 6.5) tarafından server-side uygulanır.
 *
 * Sekmenin native header'ı yok — başlık `SearchView` içinde ekran-içi çizilir.
 */
export default function SearchScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <SearchView title={strings.search.globalTitle} headerRight={<NotificationBell />} />
    </SafeAreaView>
  );
}
