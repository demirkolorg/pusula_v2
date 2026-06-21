/**
 * Yazı tipi ailesi kataloğu + ağırlık çözümleme (§13.7.7, Faz 3, 2026-06-21).
 *
 * Bu dosya **TTF font modülü import ETMEZ** — yalnızca `fontFamily` adlarını
 * (string) ve çözümleme mantığını tutar. Böylece node (vitest "unit") ortamında
 * `theme-preference` ve saf birim testleri, gerçek font ikili dosyalarını
 * çekmeden bu sabitleri kullanabilir. TTF kaynakları + `useFonts` haritası
 * ayrı (`fonts.ts`) tutulur; merkezi `Text` bileşeni buradan `resolveFontFamily`
 * ile aktif ailenin ağırlık adını okur.
 *
 * Google fontları değişken (variable) DEĞİL — her ağırlık ayrı bir aileyle
 * gelir; RN `fontWeight` non-variable fontta aileyi seçmez (fake-bold), bu
 * yüzden ağırlık → aile-adı eşlemesi her aile için açıkça yapılır.
 */

/** Uygulamada kullanılan metin ağırlıkları. */
export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

/** Seçilebilir yazı tipi kimlikleri — web `FontFamilyId` ile birebir hizalı. */
export type FontFamilyId =
  | 'poppins'
  | 'inter'
  | 'system'
  | 'lora'
  | 'manrope'
  | 'dm-sans'
  | 'jetbrains-mono'
  | 'atkinson';

/** Geçersiz/eksik tercihte düşülen varsayılan — web simetriği (`poppins`). */
export const DEFAULT_FONT_FAMILY: FontFamilyId = 'poppins';

/**
 * Seçici sırası (UI listesi) + validasyon kaynağı — web `FONT_FAMILIES` ile
 * hizalı: `poppins` başta, `system` üçüncü.
 */
export const FONT_FAMILY_IDS: readonly FontFamilyId[] = [
  'poppins',
  'inter',
  'system',
  'lora',
  'manrope',
  'dm-sans',
  'jetbrains-mono',
  'atkinson',
];

/** Verilen değer bilinen 8 yazı tipinden biri mi (ham depo değerini daraltır). */
export function isFontFamilyId(value: unknown): value is FontFamilyId {
  return typeof value === 'string' && (FONT_FAMILY_IDS as readonly string[]).includes(value);
}

/**
 * Ağırlık → RN `fontFamily` adı eşlemesi. `null` = aile o ağırlığı sağlamaz →
 * çağıran en yakın mevcut ağırlığa düşer (`resolveFontFamily`). `system`
 * tamamen `null`'dır: hiçbir `fontFamily` verilmez, RN platform varsayılanı
 * kullanılır. Adlar `@expo-google-fonts/*` modül export adlarıyla bire bir
 * aynıdır (`fonts.ts` `fontMap` aynı anahtarları yükler).
 */
type WeightMap = Record<FontWeight, string | null>;

const FAMILY_WEIGHTS: Record<FontFamilyId, WeightMap> = {
  poppins: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
  },
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  manrope: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
  'dm-sans': {
    regular: 'DMSans_400Regular',
    medium: 'DMSans_500Medium',
    semibold: 'DMSans_600SemiBold',
    bold: 'DMSans_700Bold',
  },
  'jetbrains-mono': {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
    semibold: 'JetBrainsMono_600SemiBold',
    bold: 'JetBrainsMono_700Bold',
  },
  lora: {
    regular: 'Lora_400Regular',
    medium: 'Lora_500Medium',
    semibold: 'Lora_600SemiBold',
    bold: 'Lora_700Bold',
  },
  // Atkinson: yalnız 400 + 700. medium → regular, semibold → bold(700).
  atkinson: {
    regular: 'AtkinsonHyperlegible_400Regular',
    medium: 'AtkinsonHyperlegible_400Regular',
    semibold: 'AtkinsonHyperlegible_700Bold',
    bold: 'AtkinsonHyperlegible_700Bold',
  },
  // System: paket yok — `fontFamily` verilmez (RN platform varsayılanı).
  system: {
    regular: null,
    medium: null,
    semibold: null,
    bold: null,
  },
};

/** Ağırlık düşürme sırası — istenen ağırlık yoksa soldan ilk mevcut seçilir. */
const WEIGHT_FALLBACK: Record<FontWeight, readonly FontWeight[]> = {
  regular: ['regular', 'medium', 'semibold', 'bold'],
  medium: ['medium', 'semibold', 'regular', 'bold'],
  semibold: ['semibold', 'bold', 'medium', 'regular'],
  bold: ['bold', 'semibold', 'medium', 'regular'],
};

/**
 * Seçili aile + ağırlık için RN `fontFamily` adını çözer. Aile o ağırlığı
 * sağlamıyorsa en yakın mevcut ağırlığa düşer. `system` (veya bilinmeyen aile)
 * için `undefined` döner → `Text` `fontFamily` set etmez, platform varsayılanı
 * kullanılır.
 */
export function resolveFontFamily(
  familyId: FontFamilyId,
  weight: FontWeight,
): string | undefined {
  const weights = FAMILY_WEIGHTS[familyId] ?? FAMILY_WEIGHTS[DEFAULT_FONT_FAMILY];
  for (const candidate of WEIGHT_FALLBACK[weight]) {
    const name = weights[candidate];
    if (name) return name;
  }
  return undefined;
}
