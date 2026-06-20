import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsTablet } from '@/lib/use-device-class';

/**
 * Tablet'te alttaki nav **floating pill** olarak scroll içeriğin ÜSTÜNDE yüzer
 * (bkz. `floating-pill-tab-bar.tsx`). Bu, kaydırılan ekranların son içeriğini
 * (yorum composer'ı, +ekle butonları, son kart/aktivite) pill'in arkasında
 * bırakıp tıklanamaz yapar. Kaydırılan kapsayıcının içerik `paddingBottom`'una
 * eklenmesi gereken alt boşluğu döndürür: pill `bottom = safeArea.bottom + 12` +
 * ~48 yükseklik + nefes ⇒ `safeArea.bottom + 88`. Phone'da default solid tab bar
 * zaten yer ayırdığından `0` döner (overlay yok). 2026-06-20.
 *
 * Kullanım: `contentContainerStyle={{ ..., paddingBottom: navInset || base }}`
 * (phone'da `0` falsy → bileşenin kendi taban değeri korunur).
 */
export function useFloatingNavInset(): number {
  const insets = useSafeAreaInsets();
  const isTablet = useIsTablet();
  return isTablet ? insets.bottom + 88 : 0;
}
