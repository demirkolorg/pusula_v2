/**
 * Kullanım koşulları sayfası layout'u. App shell DEĞİL; sade public layout
 * (`gizlilik` deseninin eşi) — navigasyon, realtime, oturum gerektirmez.
 */
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
