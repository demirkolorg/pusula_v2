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

import {
  DEFAULT_COLOR_THEME,
  colorThemeVars,
  type ColorThemeName,
} from '@/theme/color-themes.generated';

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

// ─── Renk paleti override (§13.7.7) ──────────────────────────────────────────

/** "R G B" kanalını `r, g, b` virgüllü forma getirir (rgba gövdesi — primarySoft). */
function channelsToTriplet(channels: string): string {
  return channels.trim().split(/\s+/).join(', ');
}

/**
 * "R G B" kanalını `#rrggbb` HEX'ine çevirir. KRİTİK: baz şema token'ları
 * (`lightColors`/`darkColors`) HEX; palet override de HEX dönmeli ki token'lar
 * **format olarak tutarlı** kalsın. Bazı tüketiciler `theme.X`'i hex varsayar —
 * `hexToRgba(theme.card)` (auth/aurora/mockup) ve `\`${theme.primary}1a\``
 * (notification-row alpha eki). `rgb(...)` dönülürse bunlar geçersiz renk üretir
 * (palet seçilince "geçersiz renk" / yanlış renk hatası — 2026-06-21 fix).
 */
function channelsToHex(channels: string): string {
  const parts = channels.trim().split(/\s+/);
  if (parts.length < 3) return '#000000';
  const toHex = (v: string): string => {
    const n = Math.max(0, Math.min(255, Number(v) | 0));
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(parts[0]!)}${toHex(parts[1]!)}${toHex(parts[2]!)}`;
}

/**
 * Üretilen palet token tablosundaki (`--color-*`) değerleri, baz şema token'ları
 * üzerine bindirerek tam bir `ColorTokens` üretir. Palet yalnız web override
 * setini (arka plan/yüzey/sınır/birincil) değiştirir; durum renkleri (success/
 * warning/destructive/info), `primarySoft`, `overlay`, `shadow` vb. baz şemadan
 * korunur — web `data-color-theme` de bunları override etmez.
 */
function applyColorTheme(base: ThemeTokens, scheme: ColorScheme, colorTheme: ColorThemeName): ThemeTokens {
  const vars = colorThemeVars[colorTheme][scheme];
  // Üretilen tablo her palette tam token setini garanti eder; eksik anahtar
  // generator hatası olur (üretimde fark edilir). Runtime'da boş string'e düş.
  const raw = (key: `--color-${string}`): string => vars[key] ?? '0 0 0';
  const c = (key: `--color-${string}`): string => channelsToHex(raw(key));
  const primary = c('--color-primary');

  return {
    ...base,
    background: c('--color-background'),
    foreground: c('--color-foreground'),
    card: c('--color-card'),
    cardForeground: c('--color-card-foreground'),
    cardBackground: c('--color-card'),
    cardBorder: c('--color-card-border'),
    muted: c('--color-muted'),
    mutedForeground: c('--color-muted-foreground'),
    surfaceStrong: c('--color-surface-strong'),

    primary,
    primaryLight: c('--color-primary-light'),
    primaryDark: c('--color-primary-dark'),
    // `primarySoft` web'de palet bazlı değil; birincil + sabit alpha ile türet.
    primarySoft: `rgba(${channelsToTriplet(raw('--color-primary'))}, 0.14)`,
    primaryForeground: c('--color-primary-foreground'),

    border: c('--color-border'),
    borderSoft: c('--color-border-soft'),
    divider: c('--color-divider'),

    textDisabled: c('--color-tab-inactive'),

    inputBackground: c('--color-input-bg'),
    inputBorder: c('--color-border'),
    inputPlaceholder: c('--color-tab-inactive'),

    tabBarBackground: c('--color-tab-bar-bg'),
    tabBarActive: primary,
    tabBarInactive: c('--color-tab-inactive'),
    headerBackground: c('--color-background'),
    headerText: c('--color-foreground'),

    skeletonBase: c('--color-skeleton-base'),
    skeletonHighlight: c('--color-skeleton-highlight'),
  };
}

/**
 * Verilen şema (+ opsiyonel renk paleti) için tam token setini döndürür.
 *
 * `scheme === null` → light. **Emerald dahil** tüm paletler üretilen
 * `colorThemeVars` tablosundan türetilir; baz şema yalnızca generated tabloda
 * olmayan alanlar (durum renkleri, `radius`/`spacing` vb. common token'lar) için
 * taban sağlar. Böylece JS token seti (`theme.*`, ör. SwipeRow `theme.card`)
 * NativeWind `vars()` className katmanıyla (`bg-card`) birebir AYNI kaynağı
 * kullanır ve sırıtmaz.
 *
 * KRİTİK (sırıtma fix): eskiden emerald `themes[resolved]` baz nesnesini
 * short-circuit ile dönüyordu; baz `card` (dark `#0a1c17`) ile generated emerald
 * `card` (`#1b2a23`) farklı olduğundan, className-temelli yüzeyler (`bg-card`,
 * vars'tan = generated) ile JS-token yüzeyleri (`theme.card`, base) dark modda
 * sırıtıyordu. Generated tabloyu tek kaynak yaparak bu kapatıldı.
 */
export function themeFor(
  scheme: ColorScheme | null | undefined,
  colorTheme: ColorThemeName = DEFAULT_COLOR_THEME,
): ThemeTokens {
  const resolved: ColorScheme = scheme === 'dark' ? 'dark' : 'light';
  return applyColorTheme(themes[resolved], resolved, colorTheme);
}
