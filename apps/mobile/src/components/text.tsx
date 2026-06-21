import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { resolveFontFamily, type FontWeight } from '@/theme/font-families';
import { useIsTablet } from '@/lib/use-device-class';
import { useThemePreference } from '@/theme/theme-provider';

type TextProps = RNTextProps & {
  /**
   * Metin ağırlığı — Google fontları değişken (variable) değil, her ağırlık
   * ayrı aileyle gelir. RN `fontWeight` non-variable fontta aileyi seçmez
   * (fake-bold), bu yüzden ağırlık burada seçili ailenin doğru variant'ına
   * eşlenir (`resolveFontFamily`). Atkinson gibi ara ağırlığı olmayan ailelerde
   * en yakın mevcut ağırlığa düşer.
   */
  weight?: FontWeight;
  /**
   * Faz 15E (DEM-305) — tablet typography auto-apply çarpanı. Tablet'te (≥768px)
   * efektif `fontSize` bu sayıyla çarpılır. Karar: `13-ui-tasarim-dili.md`
   * §13.12.3 — `text-base` (16) → `text-base` × 1.125 ≈ 18 (Apple HIG iPad
   * okuma mesafesi). Metadata chip/ikonlu badge gibi küçük kalmalı yerlerde
   * `tabletScale={1.0}` ile opt-out edilir.
   *
   * Yalnız `style.fontSize` sayısal olduğunda uygulanır — NativeWind
   * `className="text-base"` interop'u render anında `style.fontSize`'a
   * dönüştüğünden tüketici tarafında çağrı imzası değişmez. Phone'da no-op.
   */
  tabletScale?: number;
};

const TABLET_FONT_SCALE_DEFAULT = 1.125;

/**
 * Tailwind varsayılan `text-*` ölçek tablosu (mobil `tailwind.config.js`
 * fontSize'ı özelleştirmiyor). Pusula metinleri boyutu **`className` üzerinden**
 * verir (`text-sm` vb.) — NativeWind bunu doğrudan RNText'e enjekte ettiğinden
 * bu bileşenin `style` prop'unda görünmez. Boyut ölçeklemesi için className'den
 * temel fontSize'ı buradan çözeriz.
 */
const TW_TEXT_SIZE: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
  'text-3xl': 30,
  'text-4xl': 36,
  'text-5xl': 48,
  'text-6xl': 60,
  'text-7xl': 72,
};

/** `className`'den temel fontSize'ı çözer — `text-[11px]` (arbitrary) öncelikli,
 *  yoksa `text-sm`/`text-base`/… tablosu. Bulamazsa `undefined`. */
function fontSizeFromClassName(className: string | undefined): number | undefined {
  if (!className) return undefined;
  for (const cls of className.split(/\s+/)) {
    const arbitrary = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(cls);
    if (arbitrary) return Number(arbitrary[1]);
    const size = TW_TEXT_SIZE[cls];
    if (size !== undefined) return size;
  }
  return undefined;
}

/**
 * Uygulama geneli metin bileşeni — RN `Text` yerine bunu kullan.
 *
 * Görünür her metnin seçili yazı tipi ailesini render etmesini garanti eder
 * (§13.7.7, Faz 3): aktif aile + boyut context'ten (`useThemePreference`)
 * okunur. `weight` verilmezse regular, verilirse ilgili variant uygulanır;
 * `system` seçiminde (veya o ağırlık yoksa) `fontFamily` set edilmez → RN
 * platform varsayılanı kullanılır (graceful fallback). `style` (dizi dahil)
 * korunur; çağıran `style` ile aileyi isterse ezebilir (en sona eklenir).
 *
 * NativeWind `className` rengi/boyutu render etmeye devam eder; `fontFamily`
 * ve `fontSize` çarpanı burada kontrol edilir — `font-semibold` gibi ağırlık
 * sınıfları yerine `weight` prop'u kullanılır (fake-bold önlenir).
 *
 * Boyut (§13.7.7, Faz 4): sayısal `fontSize` değerleri kullanıcı `fontScale`
 * çarpanı (× varsa `tabletScale`) ile ölçeklenir. Web `<html>` font-size
 * cascade'inin RN karşılığı — yalnız `Text` ile çizilen metni kapsar.
 */
export function Text({
  weight = 'regular',
  style,
  tabletScale = TABLET_FONT_SCALE_DEFAULT,
  className,
  ...rest
}: TextProps & { className?: string }) {
  const isTablet = useIsTablet();
  const { fontFamily, fontScale } = useThemePreference();

  const family = resolveFontFamily(fontFamily, weight);

  // Temel fontSize: explicit `style.fontSize` öncelikli; yoksa `className`'deki
  // `text-*` sınıfından çözülür (Pusula metni boyutu çoğunlukla className verir).
  const flat = StyleSheet.flatten(style);
  const baseFontSize =
    typeof flat?.fontSize === 'number' ? flat.fontSize : fontSizeFromClassName(className);

  // Efektif çarpan: kullanıcı boyut tercihi × (tablet ise tablet çarpanı).
  const tabletFactor = isTablet && tabletScale !== 1 ? tabletScale : 1;
  const effectiveScale = fontScale * tabletFactor;

  const scaledFontSize =
    effectiveScale !== 1 && baseFontSize !== undefined
      ? { fontSize: baseFontSize * effectiveScale }
      : null;

  return (
    <RNText
      // `className` rengi/diğer stilleri çizmeye devam eder; `scaledFontSize`
      // explicit style olarak en sona eklendiğinden className'in `text-*`
      // fontSize'ını override eder. `family` undefined ise (system / ağırlık yok)
      // fontFamily anahtarı konmaz → RN platform varsayılanı.
      className={className}
      style={[family ? { fontFamily: family } : null, style, scaledFontSize]}
      {...rest}
    />
  );
}
