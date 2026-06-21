/**
 * Font kaynakları (TTF) + `useFonts` haritası (§13.7.7, Faz 3, 2026-06-21).
 *
 * Bu dosya gerçek font ikili modüllerini (`@expo-google-fonts/*`) içe aktarır —
 * yalnızca uygulama/RN ortamında yüklenir. Aile kataloğu, tipler ve ağırlık
 * çözümleme (`resolveFontFamily`) TTF-bağımsız `font-families.ts`'tedir (node
 * birim testleri oradan beslenir); buradan da geri ihraç edilir, böylece mevcut
 * `@/theme/fonts` import yolları kırılmaz.
 *
 * Web'deki 8 seçenekli yazı tipi seçimi (`pusula-font-family`) mobile taşınır:
 * Poppins (varsayılan), Inter, Sistem, Lora, Manrope, DM Sans, JetBrains Mono,
 * Atkinson Hyperlegible. **System** paket içermez (RN platform varsayılanı).
 *
 * Bundle notu: 7 aile yüklenir; yalnız kullanılan ağırlıklar (Poppins/Inter/
 * Manrope/DM Sans/JetBrains Mono/Lora = 400/500/600/700; Atkinson = 400/700).
 * Italic / thin / black gibi kullanılmayan ağırlıklar HARİÇ — startup maliyeti
 * minimumda tutulur; tüm yükleme tek `useFonts(fontMap)` çağrısında.
 */

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
} from '@expo-google-fonts/lora';
import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';

// Katalog + tipler + çözümleme — TTF-bağımsız kaynaktan geri ihraç.
export {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILY_IDS,
  isFontFamilyId,
  resolveFontFamily,
  type FontFamilyId,
  type FontWeight,
} from '@/theme/font-families';

import type { FontWeight } from '@/theme/font-families';

/**
 * `useFonts` haritası — anahtar = RN'de kullanılacak `fontFamily` adı,
 * değer = font kaynağı. `system` dışındaki tüm ailelerin kullanılan ağırlıklarını
 * içerir; `app/_layout.tsx` açılışta tek `useFonts(fontMap)` ile yükler.
 * Anahtarlar `font-families.ts` `FAMILY_WEIGHTS` adlarıyla birebir eşleşmeli.
 */
export const fontMap = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} as const;

/**
 * Ağırlık → varsayılan aile (`poppins`) `fontFamily` adı — **statik**. Font
 * tercihine erişemeyen yapısal stiller içindir: navigation `screenOptions`
 * (header/tab bar label) ve auth ekranı `TextInput`'ları. Bu öğeler kullanıcı
 * font ailesini değiştirse de varsayılan Poppins'te kalır (dürüst kısıt:
 * §13.7.7 "Text dışı kapsama sınırlı"). Görünür içerik metinleri seçili aileyi
 * `@/components/text` üzerinden alır.
 */
export const fontFamilyForWeight: Record<FontWeight, string> = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

/** Sınıfsız (regular) metinler ve girişler için varsayılan aile adı. */
export const defaultFontFamily = fontFamilyForWeight.regular;
