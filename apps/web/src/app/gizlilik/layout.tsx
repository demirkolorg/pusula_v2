/**
 * Gizlilik politikası sayfası layout'u (DEM-191 / Faz 7O — App Store yayını
 * gizlilik politikası URL'i ister). App shell DEĞİL; sade public layout
 * (`share/[token]` deseni gibi) — navigasyon, realtime, oturum gerektirmez.
 */
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
