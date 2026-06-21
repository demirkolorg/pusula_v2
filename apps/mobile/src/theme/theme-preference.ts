import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  type ColorThemeName,
} from '@/theme/color-themes.generated';
import {
  DEFAULT_FONT_FAMILY,
  isFontFamilyId,
  type FontFamilyId,
} from '@/theme/font-families';

/**
 * Kullanıcı tema tercihi (DEM-207). `system` cihaz ayarını izler; `light`/`dark`
 * onu geçersiz kılar. Saf get/set helper — `AsyncStorage` ile cihaz-yerel
 * saklanır (sunucu-tarafı `users.theme` kolonu yok — `02-teknoloji-kararlari.md`
 * Karar kaydı 2026-05-18). Birim test edilir.
 *
 * Renk paleti ekseni (§13.7.7, 2026-06-21) ayrı bir tercihtir: mod (light/dark/
 * system) WHICH varyantı, `colorTheme` ise HANGI paleti (emerald/blue/…) seçer.
 * İkisi bağımsız persist edilir.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Tercih okunamaz/bozuksa düşülen varsayılan — cihaz temasını izler. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

const STORAGE_KEY = 'pusula:theme-preference';
const VALID: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Verilen değer geçerli bir tercih mi (depodan okunan ham değeri daraltır). */
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

/** Saklanan tercihi yükler; yoksa/bozuksa/hata olursa `system` döner. */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Tercihi saklar — best-effort; hata oturum içi tercihi etkilemez. */
export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Yoksay — tercih bu oturumda geçerli kalır, sonraki açılışta `system`'e döner.
  }
}

// ─── Renk paleti ekseni (§13.7.7) ────────────────────────────────────────────

export type { ColorThemeName } from '@/theme/color-themes.generated';

/** Geçersiz/eksik palet tercihinde düşülen varsayılan — web simetriği. */
export { DEFAULT_COLOR_THEME } from '@/theme/color-themes.generated';

const COLOR_THEME_STORAGE_KEY = 'pusula:color-theme';

/** Verilen değer üretilen 15 paletten biri mi (ham depo değerini daraltır). */
export function isColorThemeName(value: unknown): value is ColorThemeName {
  return (
    typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value)
  );
}

/** Saklanan paleti yükler; yoksa/bozuksa/hata olursa `emerald` döner. */
export async function loadColorTheme(): Promise<ColorThemeName> {
  try {
    const raw = await AsyncStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return isColorThemeName(raw) ? raw : DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

/** Paleti saklar — best-effort; hata oturum içi seçimi etkilemez. */
export async function saveColorTheme(colorTheme: ColorThemeName): Promise<void> {
  try {
    await AsyncStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  } catch {
    // Yoksay — seçim bu oturumda geçerli kalır, sonraki açılışta `emerald`'a döner.
  }
}

// ─── Yazı tipi ailesi ekseni (§13.7.7, Faz 3) ────────────────────────────────

export { isFontFamilyId } from '@/theme/font-families';
export type { FontFamilyId } from '@/theme/font-families';

/** Geçersiz/eksik tercihte düşülen varsayılan — web simetriği (`poppins`). */
export { DEFAULT_FONT_FAMILY } from '@/theme/font-families';

const FONT_FAMILY_STORAGE_KEY = 'pusula:font-family';

/** Saklanan yazı tipini yükler; yoksa/bozuksa/hata olursa `poppins` döner. */
export async function loadFontFamily(): Promise<FontFamilyId> {
  try {
    const raw = await AsyncStorage.getItem(FONT_FAMILY_STORAGE_KEY);
    return isFontFamilyId(raw) ? raw : DEFAULT_FONT_FAMILY;
  } catch {
    return DEFAULT_FONT_FAMILY;
  }
}

/** Yazı tipini saklar — best-effort; hata oturum içi seçimi etkilemez. */
export async function saveFontFamily(fontFamily: FontFamilyId): Promise<void> {
  try {
    await AsyncStorage.setItem(FONT_FAMILY_STORAGE_KEY, fontFamily);
  } catch {
    // Yoksay — seçim bu oturumda geçerli kalır, sonraki açılışta `poppins`'e döner.
  }
}

// ─── Yazı boyutu (ölçek) ekseni (§13.7.7, Faz 4) ─────────────────────────────

/**
 * Yazı boyutu çarpanı — web `pusula-font-scale` simetriği. Web'de `<html>`
 * font-size yüzdesiyle tüm `rem` tipografisi ölçeklenir; RN'de root-REM cascade
 * yok, bu yüzden çarpan merkezi `@/components/text`'te sayısal `fontSize`'a
 * uygulanır (Text dışı metin kapsanmaz — dürüst kısıt).
 */
export const DEFAULT_FONT_SCALE = 1.0;
/** Alt sınır — web `MIN_FONT_SCALE` ile aynı (%90). */
export const MIN_FONT_SCALE = 0.9;
/** Üst sınır — web `MAX_FONT_SCALE` ile aynı (%120). */
export const MAX_FONT_SCALE = 1.2;
/** Adım — web `FONT_SCALE_STEP` ile aynı (%5). */
export const FONT_SCALE_STEP = 0.05;

const FONT_SCALE_STORAGE_KEY = 'pusula:font-scale';

/**
 * Değeri [0.9, 1.2] aralığına kelepçeler ve en yakın %5 adımına yuvarlar
 * (web `normalizeFontScale` simetriği). Geçersiz/sonsuz → varsayılan.
 */
export function normalizeFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));
  const steps = Math.round((clamped - DEFAULT_FONT_SCALE) / FONT_SCALE_STEP);
  return Number((DEFAULT_FONT_SCALE + steps * FONT_SCALE_STEP).toFixed(2));
}

/** Ölçeği yüzde tamsayısına çevirir (1.05 → 105). */
export function fontScalePercent(value: number): number {
  return Math.round(value * 100);
}

/** Saklanan yazı boyutunu yükler; yoksa/bozuksa/hata olursa `1.0` döner. */
export async function loadFontScale(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY);
    return raw === null ? DEFAULT_FONT_SCALE : normalizeFontScale(Number(raw));
  } catch {
    return DEFAULT_FONT_SCALE;
  }
}

/** Yazı boyutunu saklar — best-effort; normalize edilmiş değer yazılır. */
export async function saveFontScale(value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      FONT_SCALE_STORAGE_KEY,
      String(normalizeFontScale(value)),
    );
  } catch {
    // Yoksay — seçim bu oturumda geçerli kalır, sonraki açılışta `1.0`'a döner.
  }
}
