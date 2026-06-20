import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * "Bildirimler" sekmesinin stack'i (Faz 7K) — bildirim merkezi (kök) →
 * bildirim detay ([id]) + bildirim ayarları (push, geri butonu otomatik).
 *
 * Bildirim merkezi ekranı kendi ekran-içi başlığını çizdiği için kökte native
 * header gizlidir; detay ([id], Faz 5+6) ve ayarlar ekranı native header
 * kullanır. Tablet'te detay master-detail sağ pane'inde açılır (route push'a
 * yine düşülebilir ama index ekranı tablet'te push etmez).
 */
export default function NotificationsLayout() {
  const theme = themeFor(useColorScheme());

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        // Native header başlığı `Text` değildir — Poppins'i style ile uygula.
        headerTitleStyle: {
          color: theme.foreground,
          fontFamily: fontFamilyForWeight.semibold,
        },
        headerShadowVisible: false,
        // Geri butonu uygulama genelinde gizli (DEM-206) — geri gitme iOS'ta
        // kenardan kaydırma gesture'ı, Android'de OS-seviyesi geri ile sağlanır.
        headerBackVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="notification-settings" />
    </Stack>
  );
}
