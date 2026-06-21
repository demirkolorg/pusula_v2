import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import {
  DEFAULT_COLOR_THEME,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME_PREFERENCE,
  loadColorTheme,
  loadFontFamily,
  loadFontScale,
  loadThemePreference,
  normalizeFontScale,
  saveColorTheme,
  saveFontFamily,
  saveFontScale,
  saveThemePreference,
  type ColorThemeName,
  type FontFamilyId,
  type ThemePreference,
} from '@/theme/theme-preference';
import { colorThemeVars } from '@/theme/color-themes.generated';
import { themeFor, type ThemeTokens } from '@/theme/tokens';

type ThemeContextValue = {
  /** Aktif kullanıcı tercihi — `system` cihaz ayarını izler. */
  preference: ThemePreference;
  /** Tercihi değiştirir: anında uygular + cihaz-yerel saklar. */
  setPreference: (preference: ThemePreference) => void;
  /** Aktif renk paleti (§13.7.7) — emerald + 14 web paleti. */
  colorTheme: ColorThemeName;
  /** Paleti değiştirir: anında uygular (vars) + cihaz-yerel saklar. */
  setColorTheme: (colorTheme: ColorThemeName) => void;
  /** Aktif yazı tipi ailesi (§13.7.7, Faz 3) — poppins + 7 web seçeneği. */
  fontFamily: FontFamilyId;
  /** Yazı tipini değiştirir: anında uygular (`Text`) + cihaz-yerel saklar. */
  setFontFamily: (fontFamily: FontFamilyId) => void;
  /** Aktif yazı boyutu çarpanı (§13.7.7, Faz 4) — [0.9, 1.2], adım %5. */
  fontScale: number;
  /** Yazı boyutunu ayarlar: normalize + anında uygular + cihaz-yerel saklar. */
  setFontScale: (fontScale: number) => void;
  /**
   * Aktif şema + renk paleti için hesaplanmış JS token seti. `className` dışı
   * yerler (StyleSheet, native prop, StatusBar, navigasyon, `Icon color`) bunu
   * `useTheme()` ile tüketir — böylece JS token'lar da renk teması değişimini
   * yansıtır (NativeWind `vars` className katmanıyla senkron). Doğrudan
   * `themeFor(useColorScheme())` ÇAĞIRMA: o, paleti almaz, emerald'de donar.
   */
  theme: ThemeTokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tercihi RN `Appearance`'a uygular. `system` → `null` (cihaz ayarına bırak);
 * `light`/`dark` → zorla. `Appearance.setColorScheme` hem `useColorScheme()`
 * (dolayısıyla `themeFor`) hem NativeWind className temasını tek noktadan
 * sürer — `tailwind.config.js` `darkMode: 'media'` korunur, codemod gerekmez.
 */
function applyPreference(preference: ThemePreference): void {
  // `setColorScheme` cihazda her zaman var; ama bazı ortamlarda (RNW test,
  // eski sürüm) tanımsız olabilir — defansif çağır. Mod davranışı değişmez.
  if (typeof Appearance.setColorScheme === 'function') {
    Appearance.setColorScheme(preference === 'system' ? null : preference);
  }
}

/**
 * Kök tema sağlayıcısı (DEM-207 + §13.7.7). Açılışta saklanan mod tercihini ve
 * renk paletini yükleyip uygular; tercih + setter'ları context ile sunar
 * (Hesap → Görünüm seçici tüketir).
 *
 * Renk paleti override'ı NativeWind `vars()` ile yapılır: çocukları saran bir
 * `<View>` aktif paletin (`colorTheme` + etkin mod) `--color-*` CSS
 * değişkenlerini set eder → alt ağaçtaki tüm `bg-primary`/`text-foreground`
 * className'leri seçili paleti kullanır (web `<html data-color-theme>` cascade
 * karşılığı). Mod (light/dark) çözümü `useColorScheme()` ile — `Appearance`
 * zaten etkin şemayı sürer, `vars` hangi mod aktifse onun setini verir.
 *
 * Yükleme `AsyncStorage` üzerinden async — varsayılanlar (`system` + `emerald`)
 * ilk-an değerleriyle eşleştiği için tercih çözülene dek görünür sıçrama olmaz.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [colorTheme, setColorThemeState] = useState<ColorThemeName>(DEFAULT_COLOR_THEME);
  const [fontFamily, setFontFamilyState] = useState<FontFamilyId>(DEFAULT_FONT_FAMILY);
  const [fontScale, setFontScaleState] = useState<number>(DEFAULT_FONT_SCALE);

  const scheme = useColorScheme();
  const resolvedScheme = scheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadThemePreference(),
      loadColorTheme(),
      loadFontFamily(),
      loadFontScale(),
    ]).then(([storedPref, storedColor, storedFont, storedScale]) => {
      if (!active) return;
      setPreferenceState(storedPref);
      applyPreference(storedPref);
      setColorThemeState(storedColor);
      setFontFamilyState(storedFont);
      setFontScaleState(storedScale);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyPreference(next);
    void saveThemePreference(next);
  }, []);

  const setColorTheme = useCallback((next: ColorThemeName) => {
    setColorThemeState(next);
    void saveColorTheme(next);
  }, []);

  const setFontFamily = useCallback((next: FontFamilyId) => {
    setFontFamilyState(next);
    void saveFontFamily(next);
  }, []);

  const setFontScale = useCallback((next: number) => {
    const normalized = normalizeFontScale(next);
    setFontScaleState(normalized);
    void saveFontScale(normalized);
  }, []);

  // Aktif palet + mod için NativeWind vars seti. Mod değişince (`resolvedScheme`)
  // veya palet değişince yeniden hesaplanır.
  const themeVars = useMemo(
    () => vars(colorThemeVars[colorTheme][resolvedScheme]),
    [colorTheme, resolvedScheme],
  );

  // JS token seti (className dışı tüketiciler için) — şema + palet değişince
  // yeniden hesaplanır; `vars` className katmanıyla aynı kaynaktan (themeFor →
  // applyColorTheme) türer, böylece iki katman senkron kalır.
  const theme = useMemo(
    () => themeFor(resolvedScheme, colorTheme),
    [resolvedScheme, colorTheme],
  );

  // Context değeri yalnız ilgili tercih değişince yeni referans olur — kök
  // sağlayıcının her render'ında tüketicileri gereksiz yeniden render etmez.
  const value = useMemo(
    () => ({
      preference,
      setPreference,
      colorTheme,
      setColorTheme,
      fontFamily,
      setFontFamily,
      fontScale,
      setFontScale,
      theme,
    }),
    [
      preference,
      setPreference,
      colorTheme,
      setColorTheme,
      fontFamily,
      setFontFamily,
      fontScale,
      setFontScale,
      theme,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={themeVars} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

/** Tema tercihi + setter'ına erişim. `ThemeProvider` dışında çağrılırsa hata. */
export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference, ThemeProvider içinde kullanılmalıdır.');
  }
  return context;
}

/**
 * Aktif şema + renk paleti için hesaplanmış JS token setine erişim — `className`
 * dışı tüm yerlerde (StyleSheet, native prop, StatusBar, navigasyon, `Icon
 * color`) `themeFor(useColorScheme())` YERİNE bunu kullan. `themeFor`'u doğrudan
 * çağırmak paleti almaz (emerald'de donar); bu hook renk teması değişimini
 * yansıtır. `ThemeProvider` dışında çağrılırsa hata verir.
 */
export function useTheme(): ThemeTokens {
  return useThemePreference().theme;
}
