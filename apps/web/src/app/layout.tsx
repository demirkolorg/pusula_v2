import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { Toaster } from '@pusula/ui';
import { TRPCReactProvider } from '@/trpc/client';
import { ColorThemeProvider } from './_components/color-theme-provider';
import { FontSizeProvider } from './_components/font-size-provider';
import { ThemeProvider } from './_components/theme-provider';
import './globals.css';

// Poppins is the single project typeface. It is not a variable font on Google
// Fonts, so the weights actually used across the UI (regular / medium /
// semibold / bold) are requested explicitly. `latin-ext` covers Turkish
// glyphs (ğ ş ı İ ç ö ü).
const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

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
      className={poppins.variable}
      data-color-theme="slate"
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-svh font-sans antialiased">
        <ThemeProvider>
          <ColorThemeProvider>
            <FontSizeProvider>
              <TRPCReactProvider>{children}</TRPCReactProvider>
            </FontSizeProvider>
            <Toaster />
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
