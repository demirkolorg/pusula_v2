import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Kullanıcı tema tercihi (DEM-207). `system` cihaz ayarını izler; `light`/`dark`
 * onu geçersiz kılar. Saf get/set helper — `AsyncStorage` ile cihaz-yerel
 * saklanır (sunucu-tarafı `users.theme` kolonu yok — `02-teknoloji-kararlari.md`
 * Karar kaydı 2026-05-18). Birim test edilir.
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
