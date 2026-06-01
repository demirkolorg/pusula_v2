'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LockIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { PlannerEvent } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Calendar,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
  cn,
  trDayPickerLocale,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { PlannerEventModal } from './planner-event-modal';

const GOOGLE_PROVIDER_ID = 'google-calendar';

/** Timeline default başlangıç saati — boş günde Trello-vari 09:00 başlangıç. */
const DEFAULT_START_HOUR = 9;
/** Timeline default bitiş saati (kapalı aralık: 21:00 label'ı dahil → 21:00-22:00 segmenti). */
const DEFAULT_END_HOUR = 21;
/** Alt sınır — etkinlikler 00:00'a kadar düşebilir. */
const MIN_START_HOUR = 0;
/** Üst sınır — son label 23:00 (23:00-24:00 segmenti). */
const MAX_END_HOUR = 23;
/** Bir saat çizgisinin görsel yüksekliği (px). Etkinlik blok pozisyonu bu çarpana göre hesaplanır. */
const HOUR_HEIGHT_PX = 64;
/** Çakışan kolonlar arası yatay boşluk (px). */
const COLUMN_GAP_PX = 4;

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
 * Faz 16B (DEM-311) iskelet + Faz 16C (DEM-312) etkinlik bağlama.
 *
 * Sol kenarda 3. global panel — Gezgin + Hızlı Notlar yanında. Trello
 * "Planlayıcı" bölmesinin uyarlaması: tek-gün dikey saat şeridi 09:00-21:00,
 * ay/gün gezinme, yenile butonu, tek-tıkla etkinlik detay modal'ı.
 *
 * - Bağlama: `authClient.listAccounts()` (16A DEM-310 pattern'ı)
 * - Etkinlikler: tRPC `planner.events.list` (16C — Google Calendar API proxy)
 * - Etkinlik detayı: `?event=<id>` URL param + `<PlannerEventModal>`
 */
export function PlannerPanel({ onClose, onNavigate }: PlannerPanelProps) {
  const copy = strings.board.planner;
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventIdFromUrl = searchParams.get('event');
  const calendarIdFromUrl = searchParams.get('calendar');

  const [viewDate, setViewDate] = useState<Date>(() => startOfDay(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // 16A pattern'ı — bağlı durum sorgusu.
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

  // Etkinlik listesi sorgusu — yalnız bağlı kullanıcı için aktif.
  const dayStart = useMemo(() => startOfDay(viewDate), [viewDate]);
  const dayEnd = useMemo(() => endOfDay(viewDate), [viewDate]);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const eventsQuery = useQuery({
    ...trpc.planner.events.list.queryOptions({
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
      timeZone,
    }),
    enabled: connected,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const events = eventsQuery.data ?? [];
  const { allDay, timed } = useMemo(() => splitEvents(events), [events]);

  const reconnectRequired =
    eventsQuery.error instanceof Error &&
    eventsQuery.error.message === 'GOOGLE_RECONNECT_REQUIRED';
  const hasOtherError = eventsQuery.error != null && !reconnectRequired;

  const isToday = useMemo(() => sameDay(viewDate, new Date()), [viewDate]);
  const dateLabel = useMemo(() => formatDateHeader(viewDate), [viewDate]);

  const goPrev = () => setViewDate((d) => addDays(d, -1));
  const goNext = () => setViewDate((d) => addDays(d, 1));
  const goToday = () => setViewDate(startOfDay(new Date()));

  const isFetching = accountsQuery.isFetching || eventsQuery.isFetching;
  const handleRefresh = () => {
    void accountsQuery.refetch();
    if (connected) void eventsQuery.refetch();
  };

  const openEvent = (id: string, calendarId?: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('event', id);
    if (calendarId) next.set('calendar', calendarId);
    else next.delete('calendar');
    router.replace(`?${next.toString()}`, { scroll: false });
  };
  const closeEvent = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('event');
    next.delete('calendar');
    const query = next.toString();
    router.replace(query ? `?${query}` : '?', { scroll: false });
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
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>{strings.common.panels.closeShortcut}</TooltipContent>
        </Tooltip>
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
        {/* Tarih başlığı — tıklanır; Calendar popover ile uzak tarihlere
            tek tıkla atlama. ◀/▶ butonları tek-gün ince ayarı için kalır. */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 flex-1 justify-center gap-1 px-1 text-sm font-medium"
              aria-label={copy.pickDate}
              aria-haspopup="dialog"
              aria-expanded={datePickerOpen}
            >
              <span className="truncate" aria-live="polite">
                {dateLabel}
              </span>
              <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={viewDate}
              defaultMonth={viewDate}
              locale={trDayPickerLocale}
              captionLayout="dropdown"
              onSelect={(date) => {
                if (!date) return;
                setViewDate(startOfDay(date));
                setDatePickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
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
          aria-label={isFetching ? copy.refreshing : copy.refresh}
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCwIcon className={cn('size-4', isFetching && 'animate-spin')} />
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
        ) : reconnectRequired ? (
          <PlannerReconnect onNavigate={onNavigate} />
        ) : (
          <>
            {hasOtherError && (
              <div className="px-3 pt-3">
                <Alert variant="destructive">
                  <AlertDescription>{copy.refreshError}</AlertDescription>
                </Alert>
              </div>
            )}
            {allDay.length > 0 && (
              <PlannerAllDayBanner events={allDay} onEventClick={openEvent} />
            )}
            <PlannerTimeline
              events={timed}
              loading={eventsQuery.isPending}
              onEventClick={openEvent}
              isToday={isToday}
            />
          </>
        )}
      </div>

      {/* Etkinlik detay modal'ı — URL param'a göre açılır.
          `calendarId` URL'de yoksa backend `primary`'i sorgular (geriye uyumlu);
          çok-takvim revize'sinden itibaren her blok tıklamasında set edilir. */}
      {eventIdFromUrl && connected && (
        <PlannerEventModal
          eventId={eventIdFromUrl}
          calendarId={calendarIdFromUrl ?? undefined}
          open
          onClose={closeEvent}
        />
      )}
    </aside>
  );
}

/**
 * Boş durum CTA — bağlama yok. Trello "Hesap bağlayın" desenine bağlı.
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
 * Reconnect gerekli — Google tarafı 401/403 dönmüş veya refresh fail.
 * Yine `/account?tab=integrations`'a yönlendirir.
 */
function PlannerReconnect({ onNavigate }: { onNavigate?: () => void }) {
  const copy = strings.board.planner;
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <CalendarIcon
        aria-hidden
        className="text-destructive/60 size-12"
      />
      <div className="space-y-1">
        <p className="text-foreground text-base font-semibold">
          {copy.reconnectTitle}
        </p>
        <p className="text-muted-foreground text-balance text-sm">
          {copy.reconnectBody}
        </p>
      </div>
      <Link
        href="/account?tab=integrations"
        onClick={() => onNavigate?.()}
        className={buttonVariants()}
      >
        {copy.reconnectCta}
      </Link>
    </div>
  );
}

/**
 * Tüm gün etkinlik banner'ı — timeline'ın üstünde küçük renkli pill'ler.
 * Tıklanır; etkinlik detay modal'ını açar.
 */
function PlannerAllDayBanner({
  events,
  onEventClick,
}: {
  events: PlannerEvent[];
  onEventClick: (id: string, calendarId?: string) => void;
}) {
  const allDayLabel = strings.board.planner.allDayLabel;
  return (
    <div className="border-border flex gap-1 overflow-x-auto border-b px-3 py-2">
      <span className="text-muted-foreground self-center text-[10px] font-medium uppercase tracking-wide">
        {allDayLabel}
      </span>
      {events.map((event) => {
        const color = event.calendarColor;
        const titleAttr = event.calendarSummary
          ? `${eventTitle(event)} — ${event.calendarSummary}`
          : eventTitle(event);
        return (
          <button
            key={`${event.calendarId ?? 'primary'}-${event.id}`}
            type="button"
            onClick={() => onEventClick(event.id, event.calendarId)}
            title={titleAttr}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs transition-colors',
              !color && 'bg-primary/15 hover:bg-primary/25 text-primary',
            )}
            style={
              color
                ? {
                    backgroundColor: hexWithAlpha(color, 0.18),
                    color,
                  }
                : undefined
            }
          >
            {eventTitle(event)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tek-gün dikey timeline. Sol şeritte saat etiketleri, sağ tarafta yatay grid
 * + absolute positioned etkinlik blokları. Bugün ise geçerli zamanı işaretleyen
 * kırmızı çizgi.
 *
 * Aralık dinamiktir: boş günde 09:00-21:00 (Trello-vari); 09:00 öncesi
 * etkinlikler varsa başlangıç aşağı, 21:00 sonrası varsa bitiş yukarı kayar.
 * Çakışan etkinlikler yan yana kolonlara dağıtılır (Google Calendar mantığı).
 */
function PlannerTimeline({
  events,
  loading,
  onEventClick,
  isToday,
}: {
  events: PlannerEvent[];
  loading: boolean;
  onEventClick: (id: string, calendarId?: string) => void;
  isToday: boolean;
}) {
  const copy = strings.board.planner;
  const { startHour, endHour } = useMemo(
    () => computeTimelineRange(events),
    [events],
  );
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = startHour; h <= endHour; h += 1) list.push(h);
    return list;
  }, [startHour, endHour]);

  const positioned = useMemo(
    () =>
      layoutColumns(
        events
          .map((event) => positionEvent(event, startHour, endHour))
          .filter((p): p is PositionedEvent => p != null),
      ),
    [events, startHour, endHour],
  );
  const nowOffsetPx = useMemo(() => {
    if (!isToday) return null;
    const now = new Date();
    return hourOffsetToPx(now.getHours() + now.getMinutes() / 60, startHour);
  }, [isToday, startHour]);

  const totalHeight = hours.length * HOUR_HEIGHT_PX;

  return (
    <div className="relative">
      <div className="grid grid-cols-[48px_1fr]">
        {/* Saat şeridi sol */}
        <div>
          {hours.map((hour) => (
            <div
              key={hour}
              className="text-muted-foreground border-border/40 flex items-start justify-end border-t pr-2 pt-0.5 text-xs"
              style={{ height: `${HOUR_HEIGHT_PX}px` }}
            >
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>
        {/* Etkinlik alanı sağ */}
        <div className="relative">
          {hours.map((hour) => (
            <div
              key={hour}
              className="border-border/40 border-t"
              style={{ height: `${HOUR_HEIGHT_PX}px` }}
            />
          ))}
          {/* Bugün marker */}
          {nowOffsetPx != null && nowOffsetPx >= 0 && nowOffsetPx <= totalHeight && (
            <div
              role="presentation"
              className="border-destructive pointer-events-none absolute inset-x-0 z-10 border-t-2"
              style={{ top: `${nowOffsetPx}px` }}
            />
          )}
          {/* Etkinlik blokları — takvim rengi varsa o kullanılır, yoksa primary.
              Çakışanlar kolonlara dağıtılır (col / totalCols). */}
          {positioned.map((pos) => {
            const color = pos.event.calendarColor;
            const titleAttr = pos.event.calendarSummary
              ? `${eventTitle(pos.event)} — ${pos.event.calendarSummary}`
              : eventTitle(pos.event);
            const fallback = !color;
            const widthPct = 100 / pos.totalCols;
            const leftPct = pos.col * widthPct;
            return (
              <button
                key={`${pos.event.calendarId ?? 'primary'}-${pos.event.id}`}
                type="button"
                onClick={() => onEventClick(pos.event.id, pos.event.calendarId)}
                title={titleAttr}
                className={cn(
                  'absolute overflow-hidden rounded-md border-l-2 px-2 py-1 text-left text-xs transition-colors',
                  fallback && 'bg-primary/15 hover:bg-primary/25 border-primary',
                )}
                style={{
                  top: `${pos.top}px`,
                  height: `${Math.max(pos.height, 24)}px`,
                  left: `calc(${leftPct}% + ${pos.col === 0 ? 0 : COLUMN_GAP_PX / 2}px)`,
                  width: `calc(${widthPct}% - ${pos.col === 0 || pos.col === pos.totalCols - 1 ? COLUMN_GAP_PX / 2 : COLUMN_GAP_PX}px)`,
                  ...(color
                    ? {
                        backgroundColor: hexWithAlpha(color, 0.18),
                        borderLeftColor: color,
                      }
                    : {}),
                }}
              >
                <div className="text-foreground truncate text-xs font-medium">
                  {eventTitle(pos.event)}
                </div>
                <div className="text-muted-foreground truncate text-[10px]">
                  {formatEventTime(pos.event)}
                </div>
              </button>
            );
          })}
          {!loading && positioned.length === 0 && (
            <div className="text-muted-foreground absolute inset-x-0 top-12 text-center text-xs">
              {copy.emptyDay}
            </div>
          )}
          {loading && (
            <div className="text-muted-foreground absolute inset-x-0 top-12 text-center text-xs">
              {copy.loading}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------- helpers --------------------

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
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

function formatDateHeader(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function eventTitle(event: PlannerEvent): string {
  const raw = event.summary?.trim();
  return raw ? raw : strings.board.planner.event.untitled;
}

/**
 * Etkinlik başlangıç-bitiş saatlerini "09:30 — 11:00" formatında döndürür.
 * Tüm-gün etkinlikleri için "Tüm gün" kullanılır (banner zaten gösteriyor).
 */
function formatEventTime(event: PlannerEvent): string {
  const start = parseEventStart(event);
  const end = parseEventEnd(event);
  if (!start) return strings.board.planner.allDayLabel;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return end ? `${fmt(start)} — ${fmt(end)}` : fmt(start);
}

function parseEventStart(event: PlannerEvent): Date | null {
  if (event.start.dateTime) return new Date(event.start.dateTime);
  if (event.start.date) return new Date(`${event.start.date}T00:00:00`);
  return null;
}

function parseEventEnd(event: PlannerEvent): Date | null {
  if (event.end.dateTime) return new Date(event.end.dateTime);
  if (event.end.date) return new Date(`${event.end.date}T00:00:00`);
  return null;
}

/** Etkinlikleri "tüm gün" ve "zamanlı" olarak ikiye böler. */
function splitEvents(events: PlannerEvent[]): {
  allDay: PlannerEvent[];
  timed: PlannerEvent[];
} {
  const allDay: PlannerEvent[] = [];
  const timed: PlannerEvent[] = [];
  for (const e of events) {
    if (e.start.date && !e.start.dateTime) allDay.push(e);
    else timed.push(e);
  }
  return { allDay, timed };
}

type PositionedEvent = {
  event: PlannerEvent;
  top: number;
  height: number;
};

type LayoutedEvent = PositionedEvent & {
  /** 0-indexli kolon konumu — çakışan etkinlikler içinde sıra. */
  col: number;
  /** İçinde bulunduğu cluster'ın toplam kolon sayısı (yatay bölme paydası). */
  totalCols: number;
};

/**
 * Timeline aralığını etkinliklere göre hesapla. Boş günde default 09:00-21:00;
 * 09:00 öncesi etkinlik varsa başlangıç aşağı, 21:00 sonrası varsa bitiş yukarı
 * kayar. MIN_START_HOUR/MAX_END_HOUR ile saat dışı taşmalardan korunur.
 */
function computeTimelineRange(events: PlannerEvent[]): {
  startHour: number;
  endHour: number;
} {
  let earliest = DEFAULT_START_HOUR;
  let latest = DEFAULT_END_HOUR + 1;
  for (const e of events) {
    const start = parseEventStart(e);
    const end = parseEventEnd(e);
    if (start) {
      const h = start.getHours() + start.getMinutes() / 60;
      if (h < earliest) earliest = h;
    }
    if (end) {
      const h = end.getHours() + end.getMinutes() / 60;
      if (h > latest) latest = h;
    } else if (start) {
      const h = start.getHours() + start.getMinutes() / 60 + 0.5;
      if (h > latest) latest = h;
    }
  }
  const startHour = Math.max(
    MIN_START_HOUR,
    Math.min(DEFAULT_START_HOUR, Math.floor(earliest)),
  );
  const endHour = Math.min(
    MAX_END_HOUR,
    Math.max(DEFAULT_END_HOUR, Math.ceil(latest) - 1),
  );
  return { startHour, endHour };
}

/**
 * Etkinliği timeline'da konumlandır. `startHour`/`endHour` dinamik aralığı
 * temsil eder (label aralığı; render alanı `[startHour, endHour + 1)` saat).
 * Aralık dışı uçlar clamp'lenir.
 */
function positionEvent(
  event: PlannerEvent,
  startHour: number,
  endHour: number,
): PositionedEvent | null {
  const start = parseEventStart(event);
  if (!start) return null;
  const end = parseEventEnd(event);
  const startFloat = start.getHours() + start.getMinutes() / 60;
  const endFloat = end
    ? end.getHours() + end.getMinutes() / 60
    : startFloat + 0.5;
  const rangeEnd = endHour + 1;
  const clampedStart = Math.max(startHour, startFloat);
  const clampedEnd = Math.min(rangeEnd, Math.max(endFloat, clampedStart + 0.25));
  if (clampedEnd <= startHour) return null;
  if (clampedStart >= rangeEnd) return null;
  return {
    event,
    top: hourOffsetToPx(clampedStart, startHour),
    height:
      hourOffsetToPx(clampedEnd, startHour) -
      hourOffsetToPx(clampedStart, startHour),
  };
}

function hourOffsetToPx(hour: number, baseHour: number): number {
  return (hour - baseHour) * HOUR_HEIGHT_PX;
}

/**
 * Çakışan etkinlikleri yan yana kolonlara dağıt (Google Calendar mantığı).
 *
 * 1. Etkinlikleri başlangıca göre sırala (eşitlik: uzun olan önce).
 * 2. Greedy kolon ataması — boş ilk kolona koy, yoksa yeni kolon aç.
 * 3. Birbirine zincirle bağlı çakışma kümelerini (cluster) bul; her cluster
 *    içinde maxCol+1 = totalCols → tüm cluster üyeleri aynı paydayı paylaşır.
 */
function layoutColumns(positioned: PositionedEvent[]): LayoutedEvent[] {
  if (positioned.length === 0) return [];
  const sorted = [...positioned].sort(
    (a, b) => a.top - b.top || b.height - a.height,
  );

  const columnEndBottoms: number[] = [];
  const withCol: Array<PositionedEvent & { col: number }> = [];
  for (const p of sorted) {
    const top = p.top;
    const bottom = p.top + p.height;
    let placedCol = -1;
    for (let i = 0; i < columnEndBottoms.length; i += 1) {
      const colEnd = columnEndBottoms[i];
      if (colEnd != null && colEnd <= top) {
        columnEndBottoms[i] = bottom;
        placedCol = i;
        break;
      }
    }
    if (placedCol === -1) {
      placedCol = columnEndBottoms.length;
      columnEndBottoms.push(bottom);
    }
    withCol.push({ ...p, col: placedCol });
  }

  const byTop = [...withCol].sort((a, b) => a.top - b.top);
  type Cluster = {
    members: Array<PositionedEvent & { col: number }>;
    maxCol: number;
    activeBottom: number;
  };
  const clusters: Cluster[] = [];
  for (const p of byTop) {
    const last = clusters[clusters.length - 1];
    if (last && p.top < last.activeBottom) {
      last.members.push(p);
      last.maxCol = Math.max(last.maxCol, p.col);
      last.activeBottom = Math.max(last.activeBottom, p.top + p.height);
    } else {
      clusters.push({
        members: [p],
        maxCol: p.col,
        activeBottom: p.top + p.height,
      });
    }
  }

  const result: LayoutedEvent[] = [];
  for (const c of clusters) {
    const totalCols = c.maxCol + 1;
    for (const m of c.members) {
      result.push({ ...m, totalCols });
    }
  }
  return result;
}

/**
 * `#rrggbb` veya `#rgb` hex'i alfa kanallı `rgba(...)` string'e çevir. Google
 * Calendar `calendarList` her takvim için 7-char hex döner; bunu inline style
 * için kullanabilelim diye soft (`alpha=0.18`) rgba'ya çeviriyoruz.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  let normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
