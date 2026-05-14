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

export const metadata: Metadata = {
  title: 'Pusula',
  description: 'Trello benzeri görev yönetimi',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
