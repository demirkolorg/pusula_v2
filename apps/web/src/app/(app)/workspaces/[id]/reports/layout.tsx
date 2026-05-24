/**
 * Faz 13H (DEM-264) — workspace `/reports` merkez sayfası layout'u.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.3.
 * Workspace context yalın layout (app shell zaten parent `(app)/layout.tsx`).
 * Sayfanın başlık şeridi + "Yeni Rapor" CTA `page.tsx`'te (server'la SR'a
 * tek tab dispatch'i kolay olsun). Bu layout sadece SEO/`metadata` ve
 * dynamic rendering directive sağlar.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Raporlar — Pusula',
  robots: { index: false, follow: false },
};

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
