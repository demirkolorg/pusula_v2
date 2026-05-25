/**
 * Yenilikler (changelog) sayfası layout'u — `/yenilikler`.
 * App shell DEĞİL; sade public layout (`gizlilik/layout.tsx` paterni) —
 * navigasyon, realtime, oturum gerektirmez.
 */
import type { ReactNode } from 'react';

export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
