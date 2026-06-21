import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationSettingsView } from '@/components/notifications/notification-settings-view';
import { ScreenHeader } from '@/components/screen-header';
import { strings } from '@/lib/strings';

/**
 * Bildirim ayarları route'u (Faz 7K) — `(notifications)` stack'inde pushed route;
 * "Bildirimler" sekmesi header'ındaki dişli butonundan açılır. İçerik
 * `NotificationSettingsView`'de (tablet hesap detail pane'iyle paylaşılır); ekran-içi
 * başlık (2026-06-21 native header kaldırıldı) burada verilir.
 */
export default function NotificationSettingsScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.notificationSettings.title} />
      <NotificationSettingsView />
    </SafeAreaView>
  );
}
