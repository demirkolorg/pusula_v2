import { useWindowDimensions } from 'react-native';

/**
 * Faz 15A (DEM-301) — cihaz sınıfı (`phone` | `tablet`) hook'u.
 *
 * Eşik 768px (NativeWind `md:` standart Tailwind breakpoint). iPad mini 8.3"
 * (768×1024) **dahil** tablet branch'i alır. Karar kaydı:
 * `docs/architecture/13-ui-tasarim-dili.md` §13.12.1 + `18-ipad-uyarlamasi.md`
 * §2 (kullanıcı seçimi 2026-05-31).
 *
 * `useWindowDimensions` reactive — rotation veya Split View V2 (iPad)
 * sonrasında değer otomatik güncellenir; tüketici bileşen yeniden render olur.
 * İlk render'da bazı RN sürümleri `width: 0` döndürebilir (splash öncesi);
 * bu durumda hook güvenle `'phone'` döner ve gerçek ölçü gelir gelmez yeniden
 * değerlendirir — defaultlamak için ek koşula gerek yok.
 */
export const TABLET_BREAKPOINT_PX = 768;

export type DeviceClass = 'phone' | 'tablet';

export function useDeviceClass(): DeviceClass {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT_PX ? 'tablet' : 'phone';
}

export function useIsTablet(): boolean {
  return useDeviceClass() === 'tablet';
}

/**
 * Faz 15B (DEM-302) — yatay/dikey yönelim. `width > height` → landscape; eşitse
 * portrait. NativeWind v4 `@media (orientation: landscape)` media query'sini
 * RN runtime'da değerlendirmediği için (CSS-to-RN parser yalnız breakpoint /
 * color-scheme / hover destekler) Tailwind'in `landscape:` variant'ı yerine
 * bu hook kullanılır — spec §13.12.7 disiplini: "tablet override'ları
 * NativeWind `md:` VEYA `useDeviceClass()` hook üzerinden".
 */
export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}
