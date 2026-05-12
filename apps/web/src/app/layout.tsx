import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TRPCReactProvider } from '@/trpc/client';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pusula',
  description: 'Trello benzeri görev yönetimi',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-svh antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
