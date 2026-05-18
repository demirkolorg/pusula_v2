import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { fontFamilyForWeight } from '@/theme/fonts';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * "Hesap" sekmesinin stack'i (DEM-208) — hesap ekranı (kök) → profil düzenleme
 * + şifre değiştir (push, native header).
 *
 * Hesap ekranı kendi ekran-içi başlığını çizdiği için kökte native header
 * gizlidir; alt ekranlar native header kullanır. Geri butonu uygulama
 * genelinde gizli (DEM-206) — geri gitme iOS kenardan kaydırma / Android
 * OS-geri ile.
 */
export default function AccountLayout() {
  const theme = themeFor(useColorScheme());

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        headerTitleStyle: {
          color: theme.foreground,
          fontFamily: fontFamilyForWeight.semibold,
        },
        headerShadowVisible: false,
        headerBackVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile-edit" options={{ title: strings.profileEdit.title }} />
      <Stack.Screen name="change-password" options={{ title: strings.changePassword.title }} />
    </Stack>
  );
}
