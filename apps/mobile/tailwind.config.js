/**
 * NativeWind (Tailwind v3) yapılandırması.
 *
 * Renkler `13-ui-tasarim-dili.md` design token'larından türetildi. Semantik
 * renkler (`background`, `foreground`, `primary` …) `global.css`'teki CSS
 * değişkenlerinden okunur — light/dark `@media (prefers-color-scheme)` ile
 * değişir. Sabit `palet-*` etiket renkleri tema-bağımsız.
 *
 * TİPOGRAFİ: Proje geneli tek-tip font Poppros'tir (web simetrisi —
 * `02-teknoloji-kararlari.md` 2026-05-18). Poppins değişken font DEĞİL; her
 * ağırlık ayrı aileyle gelir ve RN `fontWeight` non-variable fontta aileyi
 * seçmez. Bu yüzden font ailesi burada `fontFamily` anahtarıyla DEĞİL,
 * `Text` sarmalayıcısı (`src/components/text.tsx`) `weight` prop'u +
 * `src/theme/fonts.ts` ağırlık→aile eşlemesiyle uygulanır. `font-medium`/
 * `font-semibold` gibi ağırlık sınıfları kullanılmaz (fake-bold önlenir).
 *
 * SENKRON: `palet-*` hex'leri `src/theme/tokens.ts` `paletteColors` ile
 * aynıdır; biri değişince diğeri de güncellenmeli.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Arka plan
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        'card-foreground': 'rgb(var(--color-card-foreground) / <alpha-value>)',
        'card-border': 'rgb(var(--color-card-border) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        'surface-strong': 'rgb(var(--color-surface-strong) / <alpha-value>)',
        // Birincil
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-light': 'rgb(var(--color-primary-light) / <alpha-value>)',
        'primary-dark': 'rgb(var(--color-primary-dark) / <alpha-value>)',
        'primary-soft': 'rgb(var(--color-primary) / 0.14)',
        'primary-foreground': 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        // Durum
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-soft': 'var(--color-warning-soft)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'var(--color-danger-soft)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        'info-soft': 'var(--color-info-soft)',
        // Sınır
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'border-soft': 'rgb(var(--color-border-soft) / <alpha-value>)',
        divider: 'rgb(var(--color-divider) / <alpha-value>)',
        // Metin
        'text-disabled': 'rgb(var(--color-text-disabled) / <alpha-value>)',
        // Form
        'input-bg': 'rgb(var(--color-input-bg) / <alpha-value>)',
        // Navigasyon
        'tab-bar': 'rgb(var(--color-tab-bar-bg) / <alpha-value>)',
        'tab-inactive': 'rgb(var(--color-tab-inactive) / <alpha-value>)',
        // Skeleton
        'skeleton-base': 'rgb(var(--color-skeleton-base) / <alpha-value>)',
        'skeleton-highlight': 'rgb(var(--color-skeleton-highlight) / <alpha-value>)',
        // Tema-bağımsız Trello/Atlassian etiket paleti.
        palet: {
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
        },
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
      },
    },
  },
  plugins: [],
};
