import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * "Panolar" sekmesinin stack'i — workspace listesi (kök) → board listesi
 * (push, geri butonu otomatik). Native header tema token'larıyla stillenir.
 */
export default function BoardsLayout() {
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
    />
  );
}
