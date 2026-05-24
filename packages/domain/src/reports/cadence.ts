/**
 * Faz 13J ([DEM-266](https://linear.app/demirkol/issue/DEM-266)) — schedule
 * cadence helper. Saf TS — runtime dep yok (Pusula `apps/worker/src/lib/
 * quiet-hours.ts` ile aynı konvansiyon: `Intl.DateTimeFormat` native ICU).
 *
 * `computeNextRunAt`: cadence + config + timezone + `from` (now veya
 * `last_run_at`) → bir sonraki UTC `Date`. Worker tick'leri `next_run_at <=
 * NOW()` filter ile due schedule'ları çeker; sonra bu fonksiyon yeni
 * `next_run_at`'i hesaplar (sonsuz döngü engeli: helper always returns
 * `from < result`).
 *
 * Domain kararları (`docs/domain/09-raporlama-kurallari.md` §9.11):
 *  - Wallclock yorumlanır: 09:00 Europe/Istanbul = "Istanbul saatiyle 09:00".
 *  - DST geçiş günü politikası: invalid wallclock (örn. 02:30 nonexistent)
 *    → ileri kayar (ilk geçerli olan dakika). Skip değil rebound, kullanıcı
 *    her gün/hafta/ay aynı saatte e-posta beklediği için.
 *  - Monthly 'last': ayın son günü (28/29/30/31).
 *  - Monthly dayOfMonth=31 + 30-günlük ay → ay sonu (gibi 'last').
 *  - DST ambiguous wallclock (sonbahar 03:30 iki kez) → ilk geçişi al
 *    (UTC ilerleyen).
 *
 * Format: pure (`from: Date` zorunlu) — test deterministik.
 */
import type { CadenceConfig } from './types';

export interface ComputeNextRunArgs {
  /** Schedule'ın cadenceConfig (discriminated union: daily/weekly/monthly). */
  config: CadenceConfig;
  /** IANA timezone (örn. 'Europe/Istanbul'). Invalid TZ → UTC fallback. */
  timezone: string;
  /** Baz an. Helper `from`'dan strictly büyük bir Date döner (sonsuz döngü engel). */
  from: Date;
}

/**
 * Cadence config + tetik anı → bir sonraki UTC `Date`. Pure fonksiyon;
 * worker + UI (next-run preview) aynı yerden çağırır.
 *
 * Algoritma:
 *  1. `from`'u TZ wallclock'una çevir (parts: year/month/day/hour/minute).
 *  2. cadence'e göre hedef wallclock'u kur (daily: bugün hh:mm; weekly:
 *     hedef gün hh:mm; monthly: hedef gün hh:mm).
 *  3. Hedef wallclock → UTC `Date` (tz reverse lookup).
 *  4. Result <= from ise advance et (daily: +1 gün; weekly: +7 gün; monthly:
 *     +1 ay).
 *  5. Monthly edge case: clamp dayOfMonth (Şubat 31 → 28/29; 30-günlük ay
 *     31 → 30; 'last' → ay sonu).
 */
export function computeNextRunAt(args: ComputeNextRunArgs): Date {
  const tz = isValidTimeZone(args.timezone) ? args.timezone : 'UTC';
  const fromParts = getZonedParts(args.from, tz);
  if (!fromParts) return args.from;

  switch (args.config.cadence) {
    case 'daily':
      return computeDailyNext({
        from: args.from,
        fromParts,
        tz,
        hour: args.config.hour,
        minute: args.config.minute,
      });
    case 'weekly':
      return computeWeeklyNext({
        from: args.from,
        fromParts,
        tz,
        dayOfWeek: args.config.dayOfWeek,
        hour: args.config.hour,
        minute: args.config.minute,
      });
    case 'monthly':
      return computeMonthlyNext({
        from: args.from,
        fromParts,
        tz,
        dayOfMonth: args.config.dayOfMonth,
        hour: args.config.hour,
        minute: args.config.minute,
      });
  }
}

// ─── Daily ─────────────────────────────────────────────────────────────────

function computeDailyNext(args: {
  from: Date;
  fromParts: ZonedParts;
  tz: string;
  hour: number;
  minute: number;
}): Date {
  // Bugünün hh:mm'i (tz wallclock) — `from`'tan sonra ise dön; değilse +1 gün.
  let candidate = wallclockToUtc(
    {
      year: args.fromParts.year,
      month: args.fromParts.month,
      day: args.fromParts.day,
      hour: args.hour,
      minute: args.minute,
    },
    args.tz,
  );
  if (candidate.getTime() <= args.from.getTime()) {
    // +1 gün — JS Date arithmetic UTC'de güvenli; sonra TZ wallclock olarak
    // değerlendiririz (DST geçiş günü duruma göre +23h veya +25h gerçek
    // olabilir; wallclockToUtc reverse lookup düzeltir).
    const tomorrowParts = advanceDay(args.fromParts);
    candidate = wallclockToUtc(
      {
        year: tomorrowParts.year,
        month: tomorrowParts.month,
        day: tomorrowParts.day,
        hour: args.hour,
        minute: args.minute,
      },
      args.tz,
    );
  }
  return candidate;
}

// ─── Weekly ────────────────────────────────────────────────────────────────

function computeWeeklyNext(args: {
  from: Date;
  fromParts: ZonedParts;
  tz: string;
  dayOfWeek: number; // 0=Sun..6=Sat
  hour: number;
  minute: number;
}): Date {
  const fromDow = dayOfWeekFromParts(args.fromParts); // 0..6
  // Hedefe kaç gün ileri? Eğer bugün aynı gün ve saat hâlâ geçmediyse 0,
  // yoksa modulo.
  let daysAhead = (args.dayOfWeek - fromDow + 7) % 7;
  let candidate = wallclockToUtc(
    {
      year: args.fromParts.year,
      month: args.fromParts.month,
      day: args.fromParts.day,
      hour: args.hour,
      minute: args.minute,
    },
    args.tz,
  );
  if (daysAhead === 0 && candidate.getTime() <= args.from.getTime()) {
    daysAhead = 7;
  }
  if (daysAhead > 0) {
    let targetParts = args.fromParts;
    for (let i = 0; i < daysAhead; i++) targetParts = advanceDay(targetParts);
    candidate = wallclockToUtc(
      {
        year: targetParts.year,
        month: targetParts.month,
        day: targetParts.day,
        hour: args.hour,
        minute: args.minute,
      },
      args.tz,
    );
  }
  return candidate;
}

// ─── Monthly ───────────────────────────────────────────────────────────────

function computeMonthlyNext(args: {
  from: Date;
  fromParts: ZonedParts;
  tz: string;
  dayOfMonth: number | 'last';
  hour: number;
  minute: number;
}): Date {
  // Önce şu ay'ın hedef günü ile dene; geçmişse +1 ay.
  let year = args.fromParts.year;
  let month = args.fromParts.month; // 1..12
  const tryMonth = () => {
    const day = resolveMonthlyDay({
      year,
      month,
      dayOfMonth: args.dayOfMonth,
    });
    return wallclockToUtc(
      { year, month, day, hour: args.hour, minute: args.minute },
      args.tz,
    );
  };
  let candidate = tryMonth();
  if (candidate.getTime() <= args.from.getTime()) {
    // +1 ay
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    candidate = tryMonth();
  }
  return candidate;
}

/**
 * Monthly dayOfMonth resolver:
 *  - `'last'` → ayın son günü.
 *  - Number ≤ ayın gün sayısı → o gün.
 *  - Number > ayın gün sayısı (örn. 31 + Şubat) → ay sonu (clamp).
 */
function resolveMonthlyDay(args: {
  year: number;
  month: number; // 1..12
  dayOfMonth: number | 'last';
}): number {
  const lastDay = lastDayOfMonth(args.year, args.month);
  if (args.dayOfMonth === 'last') return lastDay;
  return Math.min(args.dayOfMonth, lastDay);
}

/** O ay/yılın son gün numarası (28..31). UTC pivot — TZ bağımsız. */
function lastDayOfMonth(year: number, month: number): number {
  // Date(year, month, 0) — month 1-indexed bir sonraki ay → 0. günü =
  // şimdiki ay sonu. Time-of-day önemsiz (UTC pivot).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ─── Wallclock ↔ UTC dönüşümü (Intl.DateTimeFormat ile) ─────────────────────

export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

/**
 * UTC Date'i belirli TZ'deki wallclock parçalarına çevir. Pusula
 * `quiet-hours.ts` pattern'i: `Intl.DateTimeFormat({timeZone, hour12:false})`.
 * Invalid TZ → null (caller UTC fallback'i yapar).
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string): number | null => {
      const value = parts.find((p) => p.type === type)?.value;
      if (!value) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const year = get('year');
    const month = get('month');
    const day = get('day');
    let hour = get('hour');
    const minute = get('minute');
    const second = get('second');
    if (
      year === null ||
      month === null ||
      day === null ||
      hour === null ||
      minute === null ||
      second === null
    ) {
      return null;
    }
    // `en-GB` Node 22'de gece yarısında '24' dönebilir; modulo ile sar.
    if (hour === 24) hour = 0;
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
}

/**
 * Wallclock parçaları (tz'de) → UTC Date. Reverse lookup binary search'siz
 * iki adımda yapılır:
 *  1. Naive UTC: `Date.UTC(year, month-1, day, hour, minute)` → kabaca
 *     hedeflenen UTC ms.
 *  2. Bu UTC ms'i tz'de tekrar oku → wallclock farkı (offset minutes).
 *  3. UTC ms'i `offset * 60_000`'le düzelt.
 *
 * DST geçişi: invalid wallclock (örn. Türkiye 2026-03-29 03:30 atlandığında)
 * için iki ölçüm gerekir (DST-ahead vs back). Pratik politika: ilk ölçümün
 * sonucu zaten geçerli wallclock'a en yakın dakikaya kayar; bu Pusula için
 * kabul edilir (kullanıcı her gün 03:30 e-posta beklerse ve o gün 03:30
 * yoksa, 04:00 alır).
 */
export function wallclockToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  // 1. Naive UTC pivot
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  // 2. O UTC'nin tz'deki wallclock'unu oku
  const parts = getZonedParts(new Date(naive), timeZone);
  if (!parts) return new Date(naive);
  // 3. Wallclock farkı = naive değer - tz değeri (dakika cinsinden)
  const tzMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const offsetMs = naive - tzMs;
  // 4. Düzelt: gerçek UTC = naive + offsetMs
  return new Date(naive + offsetMs);
}

/** Wallclock parts'tan dayOfWeek (0=Sun..6=Sat) çıkar. UTC pivot, TZ bağımsız. */
function dayOfWeekFromParts(parts: ZonedParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** Wallclock parts'ı +1 gün ilerlet (ay/yıl carry-over). Saat sıfırlanmaz. */
function advanceDay(parts: ZonedParts): ZonedParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** IANA TZ string geçerli mi? `Intl.DateTimeFormat` throw'larsa false. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}
