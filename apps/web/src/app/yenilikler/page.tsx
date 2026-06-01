/**
 * Yenilikler (changelog) sayfası — `/yenilikler`.
 * Pusula'da çıkan yeni özellikler, iyileştirmeler ve güvenlik güncellemelerinin
 * tarihsel listesi. Müşteri/kullanıcı dilinde yazılmıştır — teknik jargon
 * (faz numarası, DEM-XXX, paket isimleri) içermez.
 *
 * Statik içerik sayfasıdır — server component, oturum/veri çekme yok.
 * `/gizlilik` deseninin aynısı; landing footer'dan linklenir.
 *
 * Veri kaynağı `@/lib/changelog-data` — render atomları (`KindBadge`,
 * `ChangelogLegend`, `DaySection`, `ChangelogDayList`) `@/components/changelog-view`
 * altında paylaşılır; aynı atomlar sol "Yenilikler" paneli tarafından da
 * kullanılır (tek render kaynağı, 2026-06-01).
 */
import type { Metadata } from 'next';
import { CHANGELOG } from '@/lib/changelog-data';
import { ChangelogDayList, ChangelogLegend } from '@/components/changelog-view';

export const metadata: Metadata = {
  title: 'Yenilikler — Pusula',
  description:
    'Pusula görev yönetim uygulamasında çıkan yeni özellikler, iyileştirmeler ve güvenlik güncellemelerinin tarihsel listesi.',
  robots: { index: true, follow: true },
};

export default function ChangelogPage() {
  return (
    <article>
      <header>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Yenilikler</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pusula&apos;da çıkan yeni özellikler, iyileştirmeler ve güvenlik güncellemeleri.
        </p>
        <ChangelogLegend label="Gösterim:" className="mt-6" />
      </header>

      <ChangelogDayList days={CHANGELOG} />
    </article>
  );
}
