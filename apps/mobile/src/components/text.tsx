import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { fontFamilyForWeight, type FontWeight } from '@/theme/fonts';

type TextProps = RNTextProps & {
  /**
   * Metin ağırlığı — Poppins değişken font olmadığından her ağırlık ayrı
   * aileyle gelir. RN `fontWeight` non-variable fontta aileyi seçmez, bu
   * yüzden ağırlık burada açıkça doğru Poppins ailesine eşlenir.
   */
  weight?: FontWeight;
};

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
 */
export function Text({ weight = 'regular', style, ...rest }: TextProps) {
  return (
    <RNText
      style={[{ fontFamily: fontFamilyForWeight[weight] }, style]}
      {...rest}
    />
  );
}
