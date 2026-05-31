import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { fontFamilyForWeight, type FontWeight } from '@/theme/fonts';
import { useIsTablet } from '@/lib/use-device-class';

type TextProps = RNTextProps & {
  /**
   * Metin ağırlığı — Poppins değişken font olmadığından her ağırlık ayrı
   * aileyle gelir. RN `fontWeight` non-variable fontta aileyi seçmez, bu
   * yüzden ağırlık burada açıkça doğru Poppins ailesine eşlenir.
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
 * Uygulama geneli metin bileşeni — RN `Text` yerine bunu kullan.
 *
 * Görünür her metnin Poppins render etmesini garanti eder: `weight`
 * verilmezse `Poppins_400Regular`, verilirse ilgili Poppins ailesi
 * uygulanır. `style` (dizi dahil) korunur; çağıran `style` ile aileyi
 * isterse ezebilir (en sona eklenir).
 *
 * NativeWind `className` rengi/boyutu render etmeye devam eder; yalnızca
 * `fontFamily` burada kontrol edilir — `font-semibold` gibi ağırlık
 * sınıfları yerine `weight` prop'u kullanılır (fake-bold önlenir).
 *
 * Faz 15E: Tablet'te (≥768px) tüm sayısal `fontSize` değerleri
 * `tabletScale` (default 1.125×) ile çarpılır. Phone'da no-op.
 */
export function Text({
  weight = 'regular',
  style,
  tabletScale = TABLET_FONT_SCALE_DEFAULT,
  ...rest
}: TextProps) {
  const isTablet = useIsTablet();
  const flat = StyleSheet.flatten(style);
  const baseFontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : undefined;
  const scaledFontSize =
    isTablet && tabletScale !== 1 && baseFontSize !== undefined
      ? { fontSize: baseFontSize * tabletScale }
      : null;

  return (
    <RNText
      style={[{ fontFamily: fontFamilyForWeight[weight] }, style, scaledFontSize]}
      {...rest}
    />
  );
}
