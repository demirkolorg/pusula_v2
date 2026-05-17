/**
 * NativeWind (Tailwind v3) yapılandırması.
 *
 * Renkler `13-ui-tasarim-dili.md` design token'larından türetildi. Semantik
 * renkler (`background`, `foreground`, `primary` …) `global.css`'teki CSS
 * değişkenlerinden okunur — light/dark `@media (prefers-color-scheme)` ile
 * değişir. Sabit `palet-*` etiket renkleri tema-bağımsız.
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
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        'card-foreground': 'rgb(var(--color-card-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
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
