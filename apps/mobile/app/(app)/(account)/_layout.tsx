import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme-provider';

/**
 * "Hesap" sekmesinin stack'i (DEM-208) — hesap ekranı (kök) → profil düzenleme,
 * güvenlik, hakkında, gizlilik, kullanım koşulları (push).
 *
 * Native header KULLANILMAZ (2026-06-21): alt ekranlar ekran-içi başlık çizer
 * (`AccountPageHeader` hero / `ScreenHeader`). Geri gitme iOS kenar-kaydırma /
 * Android OS-geri ile (DEM-206). `contentStyle` geçiş arka planını aktif renk
 * paletiyle verir.
 */
export default function AccountLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
