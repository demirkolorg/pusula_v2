import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme-provider';

/**
 * "Panolar" sekmesinin stack'i — workspace listesi (kök) → board listesi →
 * board/kart/üye/oluşturma ekranları (push).
 *
 * Native header KULLANILMAZ (2026-06-21): tüm ekranlar ekran-içi başlık çizer
 * (`ScreenHeader` / board-kart kendi şeridi). Böylece header gövdeyle aynı
 * zeminde durur (native header'ın `background` ↔ gövde `muted` tutarsızlığı
 * giderildi). Geri gitme iOS kenar-kaydırma / Android OS-geri ile (DEM-206) —
 * `gestureEnabled` Stack varsayılanı korunur. `contentStyle` geçiş sırasında
 * arka planı verir; `useTheme` ile aktif renk paletini yansıtır.
 */
export default function BoardsLayout() {
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
