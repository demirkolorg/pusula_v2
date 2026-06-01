/**
 * Changelog görsel atomları — `KindBadge`, `ChangelogLegend`, `DaySection`,
 * `ChangelogDayList`. Hem `/yenilikler` sayfası (DEM-/landing) hem de sol
 * "Yenilikler" paneli (DEM follow-up, 2026-06-01) tarafından tüketilir; tek
 * render kaynağı — kopya kod yok.
 *
 * Veri kaynağı `@/lib/changelog-data`. Bu modül salt-görseldir; veri
 * çekmez — `days` props olarak geçilir (test edilebilirlik + sayfanın server
 * component / panelin client component olabilmesi için).
 */
import type { ReactNode } from 'react';
import {
  CHANGELOG_KIND_META,
  type ChangelogDay,
  type ChangelogEntryKind,
} from '@/lib/changelog-data';

export function KindBadge({ kind }: { kind: ChangelogEntryKind }) {
  const meta = CHANGELOG_KIND_META[kind];
  // Kompakt rozet — uppercase + 10px ile dar sütunlarda (panel, mobil) çok
  // yer kaplamaz. Layout sınıfları (margin/alignment) yok; bullet+metin+badge
  // satırında (2026-06-01 ince ayar) badge sağ üst köşede sabitlenir, metin
  // genişlediğinde badge konumu değişmez — kayan sol girintiyi ortadan kaldırır.
  return (
    <span
      className={`inline-flex shrink-0 items-center self-start rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

export function ChangelogLegend({
  label,
  className,
}: {
  /** Sol-baştaki "Gösterim:" etiketi. Sayfa + panel ortak metin. */
  label: string;
  className?: string;
}): ReactNode {
  return (
    <div
      className={`border-border/60 bg-card/30 flex flex-wrap gap-3 rounded-lg border px-4 py-3 text-xs ${className ?? ''}`}
    >
      <span className="text-muted-foreground">{label}</span>
      {(Object.keys(CHANGELOG_KIND_META) as ChangelogEntryKind[]).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <KindBadge kind={kind} />
        </span>
      ))}
    </div>
  );
}

export function DaySection({ day }: { day: ChangelogDay }) {
  return (
    <section className="mt-10 first:mt-0">
      <header className="border-border/60 border-b pb-2">
        <h3 className="text-foreground text-lg font-semibold tracking-tight">
          {day.label}
        </h3>
      </header>
      <ul className="mt-4 space-y-3">
        {day.entries.map((entry, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span
              aria-hidden
              className="text-muted-foreground/60 mt-2 size-1.5 shrink-0 rounded-full bg-current"
            />
            <p className="text-foreground flex-1 text-sm leading-relaxed">{entry.text}</p>
            <KindBadge kind={entry.kind} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * `<DaySection>` listesini render eder. Hem sayfa hem panel için aynı düzen;
 * panel tarafı sadece kapsayıcı `pusula-scrollbar` ve padding'i kendi yönetir.
 */
export function ChangelogDayList({ days }: { days: readonly ChangelogDay[] }) {
  return (
    <>
      {days.map((day) => (
        <DaySection key={day.date} day={day} />
      ))}
    </>
  );
}
