/**
 * Faz 9D (DEM-130) — misafir paylaşım sayfası layout'u. App shell DEĞİL;
 * sade public layout (`auth` group'taki gibi). Realtime bağlantısı yok;
 * navigasyon menüleri yok; sadece içerik + workspace context bilgisi.
 */
import type { ReactNode } from 'react';

export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
