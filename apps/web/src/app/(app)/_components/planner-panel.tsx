'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LockIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, buttonVariants, cn } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

const GOOGLE_PROVIDER_ID = 'google-calendar';

/** Timeline başlangıç saati (sabit; Trello-vari 09:00 başlangıç). */
const TIMELINE_START_HOUR = 9;
/** Timeline bitiş saati (kapalı aralık: 9pm dahil → 21). */
const TIMELINE_END_HOUR = 21;

type PlannerPanelProps = {
  /** Panel'in kendini kapatması için global toggle'a sinyal. */
  onClose: () => void;
  /**
   * Bir aksiyon (örn. "Hesap bağla" linki) sonrası mobil sheet'in kapanması
   * için. Persistent (lg+) modda parent `undefined` geçer; panel açık kalır.
   */
  onNavigate?: () => void;
};

type ListedAccount = {
  providerId: string;
  createdAt?: Date | string | null;
};

/**
 * Faz 16B (DEM-311) — Planlayıcı paneli. Sol kenarda 3. global panel
 * (Gezgin + Hızlı Notlar yanında). Trello'nun "Planlayıcı" bölmesinin
 * uyarlaması: tek-gün dikey saat şeridi (09:00-21:00) + ay/gün gezinme +
 * yenile. Etkinlik render + Google Calendar API bağlantısı **16C'de**
 * geliyor; bu iş kapsamında panel iskelesi + bağlama durumu + boş durum
 * CTA + boş timeline gösterimi.
 *
 * Pattern Hızlı Notlar + Gezgin paneliyle birebir:
 * - `aside` w-96, `bg-background text-foreground`, `lg+`'da yuvarlak kart
 * - Header `bg-card` + Calendar ikon + başlık + Kapat (X)
 * - Mobilde overlay sheet; persistent (lg+)
 *
 * Bağlama durumu Better Auth `authClient.listAccounts()` üzerinden okunur
 * (Faz 16A DEM-310 pattern'ı). `providerId === 'google-calendar'` varsa
 * "bağlı", yoksa "bağlı değil" → CTA.
 */
export function PlannerPanel({ onClose, onNavigate }: PlannerPanelProps) {
  const copy = strings.board.planner;
  const [viewDate, setViewDate] = useState<Date>(() => startOfDay(new Date()));

  const accountsQuery = useQuery({
    queryKey: ['better-auth', 'list-accounts'],
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) {
        throw new Error(result.error.message ?? 'list_accounts_failed');
      }
      return (result.data ?? []) as ListedAccount[];
    },
    staleTime: 30_000,
  });

  const connected = Boolean(
    accountsQuery.data?.find((a) => a.providerId === GOOGLE_PROVIDER_ID),
  );

  const isToday = useMemo(() => sameDay(viewDate, new Date()), [viewDate]);
  const dateLabel = useMemo(() => formatDateHeader(viewDate), [viewDate]);

  const goPrev = () => setViewDate((d) => addDays(d, -1));
  const goNext = () => setViewDate((d) => addDays(d, 1));
  const goToday = () => setViewDate(startOfDay(new Date()));

  const handleRefresh = () => {
    void accountsQuery.refetch();
  };

  return (
    <aside
      aria-label={copy.panelTitle}
      className="bg-background text-foreground border-border flex h-full w-96 shrink-0 flex-col overflow-hidden lg:rounded-xl lg:border"
    >
      {/* Header — Calendar ikon + başlık + Kapat */}
      <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <CalendarIcon aria-hidden className="size-4 opacity-70" />
        <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={copy.close}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </header>

      {/* Tarih navigasyonu — ◀ Bugün ▶ + Yenile */}
      <div className="border-border flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={copy.prevDay}
          onClick={goPrev}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={isToday ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2"
          onClick={goToday}
          disabled={isToday}
        >
          {copy.today}
        </Button>
        <div
          className="flex-1 truncate px-1 text-center text-sm font-medium"
          aria-live="polite"
        >
          {dateLabel}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={copy.nextDay}
          onClick={goNext}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={accountsQuery.isFetching ? copy.refreshing : copy.refresh}
          onClick={handleRefresh}
          disabled={accountsQuery.isFetching}
        >
          <RefreshCwIcon
            className={cn('size-4', accountsQuery.isFetching && 'animate-spin')}
          />
        </Button>
      </div>

      {/* Gövde */}
      <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto">
        {accountsQuery.isPending ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {strings.common.loading}
          </p>
        ) : !connected ? (
          <PlannerNotConnected onNavigate={onNavigate} />
        ) : (
          <PlannerEmptyTimeline />
        )}
      </div>
    </aside>
  );
}

/**
 * Boş durum CTA — bağlama yok. Trello "Hesap bağlayın" desenine bağlı:
 * büyük ikon + açıklama + birincil buton + gizlilik ipucu.
 */
function PlannerNotConnected({ onNavigate }: { onNavigate?: () => void }) {
  const copy = strings.board.planner.notConnected;
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <CalendarIcon
        aria-hidden
        className="text-muted-foreground/40 size-12"
      />
      <div className="space-y-1">
        <p className="text-foreground text-base font-semibold">{copy.title}</p>
        <p className="text-muted-foreground text-balance text-sm">
          {copy.body}
        </p>
      </div>
      <Link
        href="/account?tab=integrations"
        onClick={() => onNavigate?.()}
        className={buttonVariants()}
      >
        <ExternalLinkIcon aria-hidden className="size-4" />
        <span className="ml-2">{copy.cta}</span>
      </Link>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <LockIcon aria-hidden className="size-3" />
        {copy.hint}
      </p>
    </div>
  );
}

/**
 * Boş timeline iskelet — bağlı kullanıcı, etkinlik yok (16B kapsamında).
 * 16C'de gerçek Google Calendar etkinlikleri bu yapının üstüne çizilecek
 * (absolute positioned blokları). Saat etiketleri sol şeritte, yatay
 * çizgiler gridi sağda. Trello pattern'ı.
 */
function PlannerEmptyTimeline() {
  const copy = strings.board.planner;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h += 1) list.push(h);
    return list;
  }, []);

  return (
    <div className="relative">
      <div className="grid grid-cols-[48px_1fr]">
        {hours.map((hour) => (
          <div key={hour} className="contents">
            <div className="text-muted-foreground border-border/40 flex h-16 items-start justify-end border-t pr-2 pt-0.5 text-xs">
              {formatHourLabel(hour)}
            </div>
            <div className="border-border/40 h-16 border-t" />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground absolute inset-x-0 top-12 text-center text-xs">
        {copy.emptyDay}
      </p>
    </div>
  );
}

// -------------------- helpers --------------------

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Gün başlığı formatı: "Pazar, 1 Haziran 2026" — Intl ile tam Türkçe.
 * Türkçe locale tarayıcıdan değil sabit `tr-TR`; uygulamanın geri kalanı
 * Türkçe.
 */
function formatDateHeader(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** Saat etiketi: "09:00", "10:00" gibi 24-saat formatı. */
function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}
