import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { Toaster } from '@pusula/ui';
import { TRPCReactProvider } from '@/trpc/client';
import { FontSizeProvider } from './_components/font-size-provider';
import { ThemeProvider } from './_components/theme-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-svh font-sans antialiased">
        <ThemeProvider>
          <FontSizeProvider>
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </FontSizeProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
