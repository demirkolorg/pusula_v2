import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/empty-state';
import { strings } from '@/lib/strings';

/**
 * "Bildirimler" sekmesi — placeholder. Bildirim merkezi Faz 7K
 * ([DEM-187](https://linear.app/demirkol/issue/DEM-187)) ile gelir.
 */
export default function NotificationsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <EmptyState
        icon="bell"
        title={strings.notifications.comingSoonTitle}
        description={strings.notifications.comingSoonBody}
      />
    </SafeAreaView>
  );
}
