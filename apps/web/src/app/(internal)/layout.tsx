/**
 * Faz 13I (DEM-265) — `(internal)` route grubu: tarayıcı zinciri tarafından
 * doğrudan açılmayan, headless/print/PDF render senaryoları için. App shell
 * (sidebar, topbar, auth-bound chrome) buraya inmez. Şu an tek route:
 *   - `/reports/print/[id]` — Puppeteer worker'ın çağırdığı print sayfası.
 *
 * Public sayılır (auth middleware'i yok); ancak içerideki tRPC procedure'leri
 * `?token` query string'i ile imzalı token doğrular (`report.print.verifyToken`).
 * `robots: noindex` her sayfada explicit set edilir (rapor verisi search
 * engine'lere düşmesin).
 */
import type { ReactNode } from 'react';
import './print.css';

export default function InternalLayout({ children }: { children: ReactNode }) {
  return children;
}
