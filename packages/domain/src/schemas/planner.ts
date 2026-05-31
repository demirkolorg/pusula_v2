import { z } from 'zod';

/**
 * Faz 16C (DEM-312) — Planlayıcı paneli için Google Calendar event şeması.
 * Şekil `events.list` ve `events.get` Google API yanıtlarının Pusula'da
 * lazım olan alt kümesidir; mapping `packages/api/src/lib/google-calendar.ts`
 * `mapGoogleEventToPlannerEvent`'te yapılır.
 *
 * Read-only V1 — Google'a yazılan/güncellenen şeysuz; tüm alanlar input
 * değil response. Bkz. `docs/architecture/19-takvim-entegrasyonu.md` §5.2 +
 * §8.2.
 */

/**
 * Google Calendar `events.start` / `events.end` yapısı. Tüm-gün
 * etkinliklerinde `date` (`YYYY-MM-DD`), zamanlı etkinliklerde `dateTime`
 * (RFC3339) gelir; ikisi mutually exclusive ama Zod'da OR ile bırakıldı —
 * mapper Google'dan geleni passthrough ediyor, runtime kontrolü display
 * tarafında yapılır.
 */
export const plannerEventTimeSchema = z.object({
  /** RFC3339 zaman damgası — zamanlı etkinliklerde. */
  dateTime: z.string().optional(),
  /** YYYY-MM-DD — tüm gün etkinliklerinde. */
  date: z.string().optional(),
  /** IANA TZ — zamanlı etkinliklerde Google döndürür (event'e özgü). */
  timeZone: z.string().optional(),
});

/**
 * Etkinlik katılımcısı. Google'dan e-mail her zaman gelir; displayName
 * opsiyonel. RSVP durumu modal'da rozetle gösterilir.
 */
export const plannerEventAttendeeSchema = z.object({
  email: z.string(),
  displayName: z.string().optional(),
  responseStatus: z
    .enum(['needsAction', 'declined', 'tentative', 'accepted'])
    .optional(),
  /** Etkinliği yaratan kullanıcının kendisi (Google işaretler). */
  self: z.boolean().optional(),
});

/**
 * Planlayıcı paneli + modal için tek etkinlik şekli. Google API yanıtının
 * UI'ye dokunan alanları; çakışan/çok günlü etkinlik mantığı 16C'nin
 * uygulama detayı (mapper veya panel).
 */
export const plannerEventSchema = z.object({
  id: z.string(),
  /** Google `summary` — başlık. Boş olabilir → UI "(başlıksız)" gösterir. */
  summary: z.string().nullable().optional(),
  /** Google `description` — plain text veya basit HTML. UI plaintext gösterir. */
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  start: plannerEventTimeSchema,
  end: plannerEventTimeSchema,
  /** Google color palette (1-11). `--palet-*` paletine map'lenir. */
  colorId: z.string().optional(),
  /** Etkinliğin Google Calendar UI'sındaki linki — "Google'da aç" butonu. */
  htmlLink: z.string(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  attendees: z.array(plannerEventAttendeeSchema).optional(),
  /**
   * Faz 16 hızlı revize (2026-06-01) — çok takvim desteği. Backend bu üç
   * alanı `calendarList.list` + `events.list` birleşiminden doldurur; UI
   * etkinlik bloğunun rengini `calendarColor` ile, hover tooltip'i
   * `calendarSummary` ile çizer. Eski tek-takvim çağrılarıyla geriye uyumlu:
   * üç alan da opsiyonel.
   */
  calendarId: z.string().optional(),
  calendarSummary: z.string().optional(),
  /** Takvimin Google'daki varsayılan arka plan rengi (hex `#rrggbb`). */
  calendarColor: z.string().optional(),
});

/**
 * Faz 16 hızlı revize (2026-06-01) — kullanıcının okuyabildiği bir takvimin
 * meta verisi (`/users/me/calendarList` yanıtının alt kümesi). `events.list`
 * çağrısında `calendarId` olarak `id` kullanılır; UI render'da `summary` +
 * `backgroundColor` etkinlik blok rengi ve hover etiketi için kullanılır.
 */
export const plannerCalendarSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  primary: z.boolean().optional(),
  selected: z.boolean().optional(),
});

/**
 * `planner.events.list` input. `start`/`end` ISO 8601 RFC3339 (genelde
 * `startOfDay` / `endOfDay` UTC tabanlı); `timeZone` IANA (display).
 */
export const plannerEventListInputSchema = z.object({
  start: z.string(),
  end: z.string(),
  timeZone: z.string(),
});

/**
 * `planner.events.get` input. Etkinliğin Google ID'si — Google response'undan
 * gelen `id` field. Tıklamada `?event=<id>&calendar=<calendarId>` URL
 * param'a yazılır; `calendarId` taşınmazsa backend `primary`'i sorgular
 * (eski tek-takvim çağrılarıyla geriye uyumlu).
 *
 * Faz 16 hızlı revize (2026-06-01) — çok takvim desteği. `primary` dışındaki
 * takvimden gelen bir etkinliğin ID'si primary'de bulunmaz, eski şema 404
 * dönderiyordu (kullanıcı modal'da "Etkinlik yüklenemedi." görüyordu).
 */
export const plannerEventGetInputSchema = z.object({
  eventId: z.string().min(1),
  calendarId: z.string().min(1).optional(),
});

export type PlannerEvent = z.infer<typeof plannerEventSchema>;
export type PlannerEventTime = z.infer<typeof plannerEventTimeSchema>;
export type PlannerEventAttendee = z.infer<typeof plannerEventAttendeeSchema>;
export type PlannerEventListInput = z.infer<typeof plannerEventListInputSchema>;
export type PlannerEventGetInput = z.infer<typeof plannerEventGetInputSchema>;
export type PlannerCalendar = z.infer<typeof plannerCalendarSchema>;
