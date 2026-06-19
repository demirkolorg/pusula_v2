/**
 * Mobil design token'ları — `13-ui-tasarim-dili.md`'den türetildi.
 *
 * NativeWind `className` kullanımı için renkler `tailwind.config.js` +
 * `global.css`'te tanımlı; bu nesne `className` dışı yerlerde (StatusBar,
 * splash, navigasyon teması, native ayarlar) kullanım içindir. Light/dark
 * setleri web `theme.css` `:root` / `.dark` ile hizalı.
 *
 * Kullanıcı-seçimli tema (DEM-207): `theme/theme-provider.tsx` açılışta
 * saklanan tercihi `Appearance.setColorScheme()` ile uygular — `useColorScheme()`
 * (ve dolayısıyla `themeFor`) etkin şemayı yansıtır; varsayılan = Sistem.
 */
export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  success: string;
  warning: string;
  destructive: string;
};

const light: ThemeTokens = {
  background: '#ffffff',
  foreground: '#1f2024',
  card: '#ffffff',
  cardForeground: '#25272b',
  muted: '#f7f7f7',
  mutedForeground: '#7c7c84',
  border: '#e9e9e9',
  primary: '#008e5f',
  primaryForeground: '#ffffff',
  success: '#22a06b',
  warning: '#d99b00',
  destructive: '#e2483d',
};

const dark: ThemeTokens = {
  background: '#1d2125',
  foreground: '#f7f7f7',
  card: '#282c33',
  cardForeground: '#f7f7f7',
  muted: '#31363c',
  mutedForeground: '#a9b0b8',
  border: '#3a3f45',
  primary: '#02a671',
  primaryForeground: '#ffffff',
  success: '#4bce97',
  warning: '#e2a200',
  destructive: '#e2584d',
};

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

export const tokens = { light, dark } as const;

export type ColorScheme = keyof typeof tokens;

/** Verilen şema için token setini döndürür (`null` → light). */
export function themeFor(scheme: ColorScheme | null | undefined): ThemeTokens {
  return scheme === 'dark' ? tokens.dark : tokens.light;
}
