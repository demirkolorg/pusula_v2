import { Stack } from 'expo-router';
import { NotificationSettingsView } from '@/components/notifications/notification-settings-view';
import { strings } from '@/lib/strings';

/**
 * Bildirim ayarları route'u (Faz 7K) — `(notifications)` stack'inde pushed route;
 * "Bildirimler" sekmesi header'ındaki dişli butonundan açılır. İçerik
 * `NotificationSettingsView`'de (tablet hesap detail pane'iyle paylaşılır); native
 * header burada verilir.
 */
export default function NotificationSettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: strings.notificationSettings.title }} />
      <NotificationSettingsView />
    </>
  );
}
