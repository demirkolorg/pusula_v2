import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { NotificationDetail } from '@/components/notifications/notification-detail';
import { strings } from '@/lib/strings';

/**
 * Bildirim detay / audit ekranı (Faz 5+6, 2026-06-21) — telefon/dar ekranda
 * tam-sayfa route. Tablet'te bunun yerine `(notifications)/index.tsx`
 * master-detail sağ pane'i aynı `NotificationDetail` bileşenini gömer.
 *
 * Bir bildirime (liste satırı VEYA push) dokununca buraya gelinir; "Karta git"
 * butonu kart hedefine (+ mevcut scroll/flash) köprüler.
 *
 * Sözleşme: `docs/architecture/06-bildirim-altyapisi.md` +
 * `docs/domain/04-bildirim-kurallari.md` "Bildirim detay ekranı".
 */
export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['left', 'right']}>
      <Stack.Screen options={{ title: strings.notifications.detail.title, headerShown: true }} />
      <NotificationDetail notificationId={id ?? null} />
    </SafeAreaView>
  );
}
