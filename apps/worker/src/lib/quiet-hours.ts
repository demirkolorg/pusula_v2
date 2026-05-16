/**
 * Quiet-hours window resolver (Faz 10F — DEM-140).
 *
 * Used by the email + push processors to suppress non-bypass notifications
 * inside the user's configured wall-clock window. Pure function; takes the
 * three quiet-hour columns plus a `Date` to evaluate against, returns a
 * boolean. The processor consults this *before* sending — a `true` result
 * stamps the outbox row `status='dead'`, `last_error='quiet_hours_window'`
 * and bypasses the provider call entirely. There is no delayed retry: the
 * user opted to silence the channel; we don't queue it for "later".
 *
 * Why pure / no I/O: the email processor already reads the preference row
 * for `email_enabled`; we hand the three columns over instead of re-querying
 * for the timezone separately. The push processor mirrors the pattern.
 *
 * Bypass policy lives in the caller, not here — `mention` /
 * `board_invitation` / `workspace_invitation` skip this check upstream.
 * Keeping the bypass list out of this module means the same predicate is
 * usable by future channels (Slack, SMS) without re-deciding which types
 * are urgent enough to override the user's wishes.
 *
 * Timezone resolution uses ICU via `Intl.DateTimeFormat` (Node 22 ships
 * full-icu by default). We deliberately do NOT depend on luxon/date-fns-tz
 * — the math is "current HH:MM in TZ" + a couple of interval comparisons,
 * and one extra dep on the worker just to express that is not worth it.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Quiet hours (sessiz
 * saatler, Faz 10F)".
 */

/**
 * The shape the helper consumes — a row-ish slice of `notification_preferences`.
 * Loose because email/push processors read the preference via different
 * column lists; keep the entrance generous so callers don't have to massage.
 */
export interface QuietHoursPreference {
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
}

/** A `now: Date` is the second arg so tests can drive the helper deterministically. */
export interface QuietHoursContext {
  now: Date;
}

/**
 * Convert a Date to the wall-clock minute-of-day in the given IANA timezone.
 * Returns a value in `[0, 1440)`. We format with `Intl.DateTimeFormat`'s
 * 24-hour locale-independent output (`en-GB` is reliably HH:mm) so we don't
 * have to parse a localised "11:30 PM" string.
 *
 * Falls back to `null` when the timezone is invalid (caller treats it as
 * "no quiet window" — better than throwing inside a processor and forcing
 * BullMQ to retry forever).
 */
export function minuteOfDayInZone(now: Date, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    return null;
  }
  const hh = parts.find((p) => p.type === 'hour')?.value;
  const mm = parts.find((p) => p.type === 'minute')?.value;
  if (!hh || !mm) return null;
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  // `en-GB` returns "24" for midnight on some Node versions; clamp to 23:59
  // so the modulo stays inside the day.
  const safeH = h === 24 ? 0 : h;
  return safeH * 60 + m;
}

/**
 * Parse the time string we store in `notification_preferences.quiet_*`
 * into a minute-of-day count. The DB column is Postgres `time without time
 * zone`, which round-trips through `node-postgres` as `HH:MM:SS` even when
 * we wrote `HH:MM` from the UI; we accept either form and drop seconds.
 * Returns `null` on garbage so the caller can skip a misconfigured row
 * instead of throwing.
 */
export function parseHHMM(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Decide whether `ctx.now` falls inside the user's quiet-hours window.
 *
 *  - All three preference fields null    → false (feature off).
 *  - `from === to`                       → false (empty / disabled window).
 *  - `from < to`  (same-day  window)     → true iff `from <= now < to`.
 *  - `from > to`  (overnight window)     → true iff `now >= from OR now < to`.
 *
 * The half-open interval (inclusive lower bound, exclusive upper bound)
 * matches the user mental model "between 23:00 and 07:00" — 07:00 itself
 * is no longer quiet, so a delivery exactly at 07:00 goes through.
 */
export function isWithinQuietHours(
  pref: QuietHoursPreference | null | undefined,
  ctx: QuietHoursContext,
): boolean {
  if (!pref) return false;
  const { quietFrom, quietTo, quietTimezone } = pref;
  if (!quietFrom || !quietTo || !quietTimezone) return false;

  const from = parseHHMM(quietFrom);
  const to = parseHHMM(quietTo);
  if (from === null || to === null) return false;
  if (from === to) return false;

  const minuteNow = minuteOfDayInZone(ctx.now, quietTimezone);
  if (minuteNow === null) return false;

  if (from < to) {
    return minuteNow >= from && minuteNow < to;
  }
  // Overnight: e.g. 23:00 → 07:00.
  return minuteNow >= from || minuteNow < to;
}

/** Stamp the outbox row uses when quiet-hours suppresses a delivery. */
export const QUIET_HOURS_DEAD_REASON = 'quiet_hours_window';

/**
 * Notification types that bypass quiet-hours — mention + invitations. The
 * processor consults this list *before* it loads the preference so a
 * mute-bypass type never even pays for the lookup. Kept in sync with the
 * mute-bypass list in `packages/api/src/lib/notification-rules.ts`.
 */
export const QUIET_HOURS_BYPASS_TYPES = new Set([
  'mention',
  'board_invitation',
  'workspace_invitation',
]);

export function isQuietHoursBypassType(type: string): boolean {
  return QUIET_HOURS_BYPASS_TYPES.has(type);
}
