import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme-provider';

/**
 * "Bildirimler" sekmesinin stack'i (Faz 7K) — bildirim merkezi (kök) →
 * bildirim detay ([id]) + bildirim ayarları (push).
 *
 * Native header KULLANILMAZ (2026-06-21): tüm ekranlar ekran-içi başlık çizer
 * (`ScreenHeader`). Geri gitme iOS kenar-kaydırma / Android OS-geri ile
 * (DEM-206). `contentStyle` geçiş arka planını aktif renk paletiyle verir.
 */
export default function NotificationsLayout() {
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
