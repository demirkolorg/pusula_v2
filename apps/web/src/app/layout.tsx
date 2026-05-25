import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import {
  Atkinson_Hyperlegible,
  DM_Sans,
  Inter,
  JetBrains_Mono,
  Lora,
  Manrope,
  Poppins,
} from 'next/font/google';
import { Toaster } from '@pusula/ui';
import { TRPCReactProvider } from '@/trpc/client';
import { ColorThemeProvider } from './_components/color-theme-provider';
import { FontFamilyProvider } from './_components/font-family-provider';
import { FontSizeProvider } from './_components/font-size-provider';
import { ThemeProvider } from './_components/theme-provider';
import './globals.css';

// Poppins is the brand/default typeface. Additional families below are
// opt-in personalization options exposed via the header `FontToggle`
// — only the active family's font file is actually requested by the
// browser; the others stay as preloaded CSS variables that can be swapped
// at runtime without an extra fetch. `latin-ext` covers Turkish glyphs
// (ğ ş ı İ ç ö ü) on every family.
const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-lora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// Atkinson Hyperlegible only ships Regular + Bold on Google Fonts; missing
// weights fall back to the nearest available weight (the browser handles
// the substitution automatically).
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
});

const fontVariables = [
  poppins.variable,
  inter.variable,
  manrope.variable,
  lora.variable,
  dmSans.variable,
  jetbrainsMono.variable,
  atkinson.variable,
].join(' ');

// Link önizlemeleri (WhatsApp, Slack, vb.) mutlak URL ister; `metadataBase`
// olmadan `opengraph-image` göreli kalır. Üretim domain'i sabit, env ile
// geçersiz kılınabilir.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pusulaportal.com';

// Tek cümlelik tanıtım metni — link önizlemesinde başlığın altında görünür.
const siteDescription = 'Workspace, pano ve kart akışlarını tek ekranda yönetin.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Pusula',
  description: siteDescription,
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Görsel `opengraph-image.tsx` ile üretilir; Next.js og:image / twitter:image
  // meta etiketlerini otomatik ekler.
  openGraph: {
    type: 'website',
    siteName: 'Pusula',
    title: 'Pusula — Görev ve Pano Yönetimi',
    description: siteDescription,
    url: siteUrl,
    locale: 'tr_TR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pusula — Görev ve Pano Yönetimi',
    description: siteDescription,
  },
};

// Tablet/dokunmatik uyumluluğu (DEM-248) — explicit viewport: ölçeklendirme
// device-width'e sabitlenir, `viewportFit: 'cover'` notch/safe-area'lı tablet
// tarayıcılarında içerik kenara kadar uzanır. Masaüstü davranışını etkilemez.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="tr"
      className={fontVariables}
      data-color-theme="slate"
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-svh font-sans antialiased">
        <ThemeProvider>
          <ColorThemeProvider>
            <FontFamilyProvider>
              <FontSizeProvider>
                <TRPCReactProvider>{children}</TRPCReactProvider>
              </FontSizeProvider>
            </FontFamilyProvider>
            <Toaster />
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
