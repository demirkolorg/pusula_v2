import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';
import {
  DEFAULT_THEME_PREFERENCE,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '@/theme/theme-preference';

type ThemeContextValue = {
  /** Aktif kullanıcı tercihi — `system` cihaz ayarını izler. */
  preference: ThemePreference;
  /** Tercihi değiştirir: anında uygular + cihaz-yerel saklar. */
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tercihi RN `Appearance`'a uygular. `system` → `null` (cihaz ayarına bırak);
 * `light`/`dark` → zorla. `Appearance.setColorScheme` hem `useColorScheme()`
 * (dolayısıyla `themeFor`) hem NativeWind className temasını tek noktadan
 * sürer — `tailwind.config.js` `darkMode: 'media'` korunur, codemod gerekmez.
 */
function applyPreference(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}

/**
 * Kök tema sağlayıcısı (DEM-207). Açılışta saklanan tercihi yükleyip uygular;
 * tercih + setter'ı context ile sunar (Hesap → Görünüm seçici tüketir).
 * Yükleme `AsyncStorage` üzerinden async — varsayılan `system` zaten cihaz
 * temasıdır, bu yüzden tercih çözülene dek görünür bir tema sıçraması olmaz.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);

  useEffect(() => {
    let active = true;
    void loadThemePreference().then((stored) => {
      if (!active) return;
      setPreferenceState(stored);
      applyPreference(stored);
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

  // Context değeri yalnız `preference` değişince yeni referans olur — kök
  // sağlayıcının her render'ında tüketicileri gereksiz yeniden render etmez.
  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Tema tercihi + setter'ına erişim. `ThemeProvider` dışında çağrılırsa hata. */
export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference, ThemeProvider içinde kullanılmalıdır.');
  }
  return context;
}
