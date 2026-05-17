import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/empty-state';
import { strings } from '@/lib/strings';

/**
 * "Arama" sekmesi — placeholder. Gerçek arama UI'si Faz 7I
 * ([DEM-185](https://linear.app/demirkol/issue/DEM-185)) ile gelir.
 */
export default function SearchScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <EmptyState
        icon="search"
        title={strings.search.comingSoonTitle}
        description={strings.search.comingSoonBody}
      />
    </SafeAreaView>
  );
}
