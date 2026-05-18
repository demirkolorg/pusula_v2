/**
 * Poppins tipografi — proje geneli tek-tip font kararı (web `Inter → Poppins`
 * simetrisi, bkz. `docs/architecture/02-teknoloji-kararlari.md` 2026-05-18).
 *
 * Poppins değişken (variable) font DEĞİL — her ağırlık ayrı bir aileyle gelir.
 * React Native'de `fontWeight` non-variable bir fontta aileyi otomatik
 * seçmez (fake-bold üretir), bu yüzden ağırlık → aile eşlemesi açıkça yapılır.
 *
 * `useFonts`'a verilen anahtarlar burada tek kaynaktan türetilir; ekranlar
 * `Text` sarmalayıcısı (`src/components/text.tsx`) üzerinden bu aileleri alır.
 */

// `@expo-google-fonts/poppins` her ağırlığı ayrı modül olarak verir.
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

/** Uygulamada kullanılan metin ağırlıkları. */
export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * `useFonts` haritası — anahtar = RN'de kullanılacak `fontFamily` adı,
 * değer = font kaynağı. Anahtar adları `@expo-google-fonts` ile aynıdır.
 */
export const fontMap = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} as const;

/** Ağırlık → RN `fontFamily` adı. */
export const fontFamilyForWeight: Record<FontWeight, string> = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

/** Sınıfsız (regular) metinler ve girişler için varsayılan aile. */
export const defaultFontFamily = fontFamilyForWeight.regular;
