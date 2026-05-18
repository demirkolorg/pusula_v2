import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * "Bildirimler" sekmesinin stack'i (Faz 7K) — bildirim merkezi (kök) →
 * bildirim ayarları (push, geri butonu otomatik).
 *
 * Bildirim merkezi ekranı kendi ekran-içi başlığını çizdiği için kökte native
 * header gizlidir; ayarlar ekranı native header + geri butonu kullanır.
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
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="notification-settings" />
    </Stack>
  );
}
