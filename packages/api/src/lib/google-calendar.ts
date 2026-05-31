import { TRPCError } from '@trpc/server';
import {
  type PlannerCalendar,
  plannerCalendarSchema,
  type PlannerEvent,
  plannerEventSchema,
  type PlannerEventListInput,
} from '@pusula/domain';

/**
 * Faz 16C (DEM-312) — Google Calendar API hafif `fetch` wrapper.
 *
 * Karar (Karar kaydı 2026-05-31 K8): `googleapis` SDK kullanılmaz — sadece
 * iki endpoint çağıracağız (`events.list` + `events.get`), SDK ağır + tip
 * yükü yüksek.
 *
 * Token akışı (Karar kaydı 2026-06-01 — 16A):
 *  - Better Auth `account` tablosunda `providerId='google-calendar'` row
 *    var (16A `genericOAuth` plugin'i tarafından yazılmış);
 *  - Token yenileme `getAccessToken({ providerId, userId })` ile otomatik;
 *  - Bizim wrapper bunu çağırır → Bearer header ile fetch yapar;
 *  - Account row yok → `UNAUTHORIZED GOOGLE_NOT_CONNECTED`;
 *  - Token refresh fail / 401 → `UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED`;
 *  - 5xx → `INTERNAL_SERVER_ERROR`.
 *
 * Bkz. `docs/architecture/19-takvim-entegrasyonu.md` §4.4 + §8.
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Better Auth `getAccessToken` benzeri sözleşme. Caller (tRPC procedure)
 * Better Auth API'sini sarıp bunu enjekte eder — wrapper bağımlılığı yok.
 * Dönüş: refresh sonrası geçerli access token, ya da `null` (bağlantı yok /
 * yenilenemedi).
 */
export type GetAccessToken = (input: {
  providerId: 'google-calendar';
  userId: string;
}) => Promise<string | null>;

/**
 * Connection-status okuyucu sözleşmesi. tRPC procedure'i Better Auth'tan
 * sorgulayıp veya `accounts` tablosunu Drizzle ile sorgulayıp implementasyon
 * sağlar. Pure-functional wrapper bağımsız test edilebilir.
 */
export type IsConnected = (userId: string) => Promise<boolean>;

export interface GoogleCalendarDeps {
  getAccessToken: GetAccessToken;
}

/**
 * Bir Google API çağrısı — token al, fetch yap, hata mapping uygula.
 * 5xx + 401 + 403 + network hatası TRPCError'a maplenir; 2xx body parse
 * edilir (caller'a `unknown` dönülmez, generic `T` ile döner).
 */
async function googleFetch<T>(
  userId: string,
  url: string,
  deps: GoogleCalendarDeps,
): Promise<T> {
  let token: string | null;
  try {
    token = await deps.getAccessToken({ providerId: 'google-calendar', userId });
  } catch {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_RECONNECT_REQUIRED',
    });
  }
  if (!token) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_NOT_CONNECTED',
    });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'GOOGLE_FETCH_FAILED',
    });
  }

  if (res.status === 401 || res.status === 403) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_RECONNECT_REQUIRED',
    });
  }
  if (res.status === 404) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'EVENT_NOT_FOUND' });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `GOOGLE_API_${res.status}`,
    });
  }

  return (await res.json()) as T;
}

/**
 * Google Calendar `events.list` tek bir takvim için. `start`/`end` zamanı
 * RFC3339; `timeZone` Google response'unun nasıl sunulacağı (UI display TZ'i).
 * `singleEvents=true` tekrarlı etkinlikleri instance'lara açar; `orderBy=startTime`
 * sıralı döner. `calendarId='primary'` → kullanıcının birincil takvimi.
 */
export async function listEventsForCalendar(
  userId: string,
  calendarId: string,
  input: PlannerEventListInput,
  deps: GoogleCalendarDeps,
): Promise<PlannerEvent[]> {
  const params = new URLSearchParams({
    timeMin: input.start,
    timeMax: input.end,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
    timeZone: input.timeZone,
  });
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const data = await googleFetch<{ items?: unknown[] }>(userId, url, deps);
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((raw) => safeMapEvent(raw))
    .filter((event): event is PlannerEvent => event !== null);
}

/** Eski isim — geriye uyumluluk için (henüz başka yerde kullanılmıyor ama kontrat sabit). */
export async function listPrimaryEvents(
  userId: string,
  input: PlannerEventListInput,
  deps: GoogleCalendarDeps,
): Promise<PlannerEvent[]> {
  return listEventsForCalendar(userId, 'primary', input, deps);
}

/**
 * Faz 16 hızlı revize (2026-06-01) — kullanıcının erişebildiği tüm takvimlerin
 * meta verisi. `minAccessRole=reader` ile yalnız okuma izni olan takvimleri
 * döndürür (paylaşılan + iş + kişisel). `showHidden=false` Google UI'sında
 * gizlenmiş takvimleri elemekte (kullanıcı zaten görmek istemiyor).
 *
 * Şu an `selected` flag UI tercihi (Google Calendar'da "Takvimlerim" altında
 * göster) — biz dahil her takvimi çekiyoruz; ileride V2'de kullanıcı seçimi
 * eklenince bu flag'e bakılabilir.
 */
export async function listVisibleCalendars(
  userId: string,
  deps: GoogleCalendarDeps,
): Promise<PlannerCalendar[]> {
  const params = new URLSearchParams({
    minAccessRole: 'reader',
    showHidden: 'false',
    showDeleted: 'false',
    maxResults: '250',
  });
  const url = `${CALENDAR_API_BASE}/users/me/calendarList?${params.toString()}`;
  const data = await googleFetch<{ items?: unknown[] }>(userId, url, deps);
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((raw) => safeMapCalendar(raw))
    .filter((cal): cal is PlannerCalendar => cal !== null);
}

/**
 * Faz 16 hızlı revize — kullanıcının okuyabildiği tüm takvimlerden etkinlik
 * birleşik listesi. Her takvim için `events.list` paralel çağrılır,
 * `Promise.allSettled` ile bir takvim 403/404 verirse diğerleri çalışmaya
 * devam eder. Etkinlik üzerine `calendarId`/`calendarSummary`/`calendarColor`
 * eklenir → UI etkinlik bloğunu o takvimin rengiyle çizebilsin. Sonuç
 * `start` zamanına göre artan sıralı.
 *
 * Bağlantı/yetki hatası (`UNAUTHORIZED`) bu üst seviyede bir kez fırlatılır;
 * tek bir takvimin geçici hatası sessizce atlanır.
 */
export async function listEventsFromAllCalendars(
  userId: string,
  input: PlannerEventListInput,
  deps: GoogleCalendarDeps,
): Promise<PlannerEvent[]> {
  const calendars = await listVisibleCalendars(userId, deps);

  const settled = await Promise.allSettled(
    calendars.map(async (cal) => {
      const events = await listEventsForCalendar(userId, cal.id, input, deps);
      return events.map<PlannerEvent>((event) => ({
        ...event,
        calendarId: cal.id,
        calendarSummary: cal.summary,
        calendarColor: cal.backgroundColor,
      }));
    }),
  );

  // İlk reconnect/auth hatası top-level'da rethrow et; tek-takvim hatası sessiz.
  const reconnectFail = settled.find(
    (r): r is PromiseRejectedResult =>
      r.status === 'rejected' &&
      r.reason instanceof TRPCError &&
      (r.reason.message === 'GOOGLE_RECONNECT_REQUIRED' ||
        r.reason.message === 'GOOGLE_NOT_CONNECTED'),
  );
  if (reconnectFail) {
    throw reconnectFail.reason;
  }

  const combined: PlannerEvent[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') combined.push(...result.value);
  }

  combined.sort((a, b) => sortableInstant(a) - sortableInstant(b));
  return combined;
}

function sortableInstant(event: PlannerEvent): number {
  const raw = event.start.dateTime ?? event.start.date;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function safeMapCalendar(raw: unknown): PlannerCalendar | null {
  const result = plannerCalendarSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Tek etkinlik detayı — modal için. `calendarId` taşınmazsa `primary` sorgulanır
 * (eski davranış). Faz 16 hızlı revize'den itibaren UI `calendarId` taşır;
 * etkinlik primary dışında bir takvimde olsa bile doğru takvim sorgulanır
 * (eski şema 404 dönderirdi).
 *
 * Bulunamazsa `NOT_FOUND` (404 mapping).
 */
export async function getEvent(
  userId: string,
  eventId: string,
  deps: GoogleCalendarDeps,
  calendarId: string = 'primary',
): Promise<PlannerEvent> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const raw = await googleFetch<unknown>(userId, url, deps);
  const event = safeMapEvent(raw);
  if (!event) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'GOOGLE_EVENT_INVALID',
    });
  }
  return event;
}

/**
 * Google response → `PlannerEvent` mapper. Hatalı/eksik bir alanı olan
 * etkinlikleri sessizce düşürür (list path'inde) — tek etkinlik panel'i
 * kırmasın.
 */
export function mapGoogleEventToPlannerEvent(raw: unknown): PlannerEvent {
  const parsed = plannerEventSchema.parse(raw);
  return parsed;
}

function safeMapEvent(raw: unknown): PlannerEvent | null {
  const result = plannerEventSchema.safeParse(raw);
  return result.success ? result.data : null;
}
