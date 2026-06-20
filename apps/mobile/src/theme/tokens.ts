/**
 * Mobil design token'ları — `13-ui-tasarim-dili.md`'den türetildi.
 *
 * NativeWind `className` kullanımı için renkler `tailwind.config.js` +
 * `global.css`'te tanımlı; bu nesne `className` dışı yerlerde (StatusBar,
 * splash, navigasyon teması, StyleSheet, native ayarlar) kullanım içindir.
 *
 * Kullanıcı-seçimli tema (DEM-207): `theme/theme-provider.tsx` açılışta
 * saklanan tercihi `Appearance.setColorScheme()` ile uygular — `useColorScheme()`
 * (ve dolayısıyla `themeFor`) etkin şemayı yansıtır; varsayılan = Sistem.
 *
 * SENKRON: buradaki hex değerleri `global.css` RGB kanallarının karşılığıdır.
 * Biri değişince diğeri de güncellenmeli — DEM-177.
 */

// ─── Renk token tipi ──────────────────────────────────────────────────────────

export type ColorTokens = {
  // Arka plan katmanları
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  cardBackground: string;
  cardBorder: string;
  muted: string;
  mutedForeground: string;
  surfaceStrong: string;
  // Birincil
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primarySoft: string;
  primaryForeground: string;
  // Durum
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  destructive: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  // Sınır
  border: string;
  borderSoft: string;
  divider: string;
  // Metin
  textDisabled: string;
  // Form
  inputBackground: string;
  inputBorder: string;
  inputPlaceholder: string;
  // Katman
  overlay: string;
  shadow: string;
  // Navigasyon
  tabBarBackground: string;
  tabBarActive: string;
  tabBarInactive: string;
  headerBackground: string;
  headerText: string;
  // Skeleton
  skeletonBase: string;
  skeletonHighlight: string;
};

// ─── Tema-bağımsız token tipi ─────────────────────────────────────────────────

export type CommonTokens = {
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; full: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; '2xl': number };
  fontSize: { xs: number; sm: number; md: number; lg: number; xl: number; '2xl': number };
  /** Referans değerleri — font ailesi seçimi `src/theme/fonts.ts` üzerinden yapılır. */
  fontWeight: { regular: string; medium: string; semibold: string; bold: string };
  opacity: { disabled: number; pressed: number; overlay: number };
};

export type ThemeTokens = ColorTokens & CommonTokens;

// ─── Light tema ───────────────────────────────────────────────────────────────

const lightColors: ColorTokens = {
  background: '#f4fbf8',
  foreground: '#06231c',
  card: '#ffffff',
  cardForeground: '#06231c',
  cardBackground: '#ffffff',
  cardBorder: '#e0f0eb',
  muted: '#eef8f4',
  mutedForeground: '#4f746a',
  surfaceStrong: '#dff1eb',

  primary: '#0f9171',
  primaryLight: '#1ba882',
  primaryDark: '#0b735a',
  primarySoft: 'rgba(15, 145, 113, 0.12)',
  primaryForeground: '#ffffff',

  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  destructive: '#e2483d',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  info: '#2563eb',
  infoSoft: '#dbeafe',

  border: '#c8e5dc',
  borderSoft: '#e0f0eb',
  divider: '#d9eee7',

  textDisabled: '#8dada4',

  inputBackground: '#ffffff',
  inputBorder: '#c8e5dc',
  inputPlaceholder: '#8dada4',

  overlay: 'rgba(6, 35, 28, 0.42)',
  shadow: 'rgba(6, 35, 28, 0.10)',

  tabBarBackground: '#ffffff',
  tabBarActive: '#0f9171',
  tabBarInactive: '#8dada4',
  headerBackground: '#f4fbf8',
  headerText: '#06231c',

  skeletonBase: '#e0f0eb',
  skeletonHighlight: '#f4fbf8',
};

// ─── Dark tema ────────────────────────────────────────────────────────────────

const darkColors: ColorTokens = {
  background: '#06110e',
  foreground: '#e8fbf6',
  card: '#0a1c17',
  cardForeground: '#e8fbf6',
  cardBackground: '#0e2a23',
  cardBorder: '#1d4b40',
  muted: '#0e2a23',
  mutedForeground: '#9fc9be',
  surfaceStrong: '#12382f',

  primary: '#1ba882',
  primaryLight: '#24c99d',
  primaryDark: '#0f9171',
  primarySoft: 'rgba(27, 168, 130, 0.14)',
  primaryForeground: '#ffffff',

  success: '#22c55e',
  successSoft: 'rgba(34, 197, 94, 0.14)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  destructive: '#e2584d',
  danger: '#ef4444',
  dangerSoft: 'rgba(239, 68, 68, 0.16)',
  info: '#38bdf8',
  infoSoft: 'rgba(56, 189, 248, 0.14)',

  border: '#1d4b40',
  borderSoft: '#16382f',
  divider: '#16382f',

  textDisabled: '#5f8f84',

  inputBackground: '#0a1c17',
  inputBorder: '#1d4b40',
  inputPlaceholder: '#5f8f84',

  overlay: 'rgba(0, 0, 0, 0.58)',
  shadow: 'rgba(0, 0, 0, 0.35)',

  tabBarBackground: '#081713',
  tabBarActive: '#1ba882',
  tabBarInactive: '#6fa99a',
  headerBackground: '#06110e',
  headerText: '#e8fbf6',

  skeletonBase: '#0e2a23',
  skeletonHighlight: '#12382f',
};

// ─── Ortak token'lar (tema-bağımsız) ─────────────────────────────────────────

export const commonTheme: CommonTokens = {
  radius: { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, full: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 },
  fontSize: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, '2xl': 28 },
  fontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  opacity: { disabled: 0.45, pressed: 0.75, overlay: 0.58 },
};

// ─── Palet ───────────────────────────────────────────────────────────────────

/** Tema-bağımsız Trello/Atlassian etiket paleti (web `--palet-*`). */
export const paletteColors = {
  kirmizi: '#f87168',
  turuncu: '#fca700',
  sari: '#eed12b',
  lime: '#94c748',
  yesil: '#4bce97',
  sky: '#6cc3e0',
  mavi: '#669df1',
  indigo: '#5b51d8',
  mor: '#c97cf4',
  pembe: '#e774bb',
  gri: '#8c8f97',
} as const;

// ─── Tema nesneleri ───────────────────────────────────────────────────────────

export const themes: { light: ThemeTokens; dark: ThemeTokens } = {
  light: { ...lightColors, ...commonTheme },
  dark: { ...darkColors, ...commonTheme },
};

/** Geriye dönük uyumluluk — `tokens.light` / `tokens.dark` hâlâ çalışır. */
export const tokens = themes;

export type ColorScheme = keyof typeof themes;

/** Verilen şema için tam token setini döndürür (`null` → light). */
export function themeFor(scheme: ColorScheme | null | undefined): ThemeTokens {
  return scheme === 'dark' ? themes.dark : themes.light;
}
