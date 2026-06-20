/**
 * Small locale-aware formatting helpers for the web app. Centralized so the
 * eventual i18n swap (locale-driven `Intl` options) is a single seam, the same
 * way `strings.ts` centralizes copy.
 */

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const relativeFormatter = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

// Notification due-date copy: short date (gün + kısa ay) + a weekday or time
// suffix. Device-local on purpose — unlike the worker (fixed Europe/Istanbul for
// push/email), the in-app notification center renders in the viewer's browser
// timezone. `dueShort*` mirror the worker's `formatDueTr` shape ("25 Haz Cmt" /
// "25 Haz 14:00") so the two channels read identically apart from the TZ.
const dueShortWeekdayFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  weekday: 'short',
});
const dueShortTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const midnightProbeFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Format a date for display (medium, Turkish locale). Accepts a `Date` or ISO string. */
export function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.format(date);
}

/** Format a date with time for detail views (medium date + short time, Turkish locale). */
export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormatter.format(date);
}

/**
 * Format a date as a `yyyy-mm-dd` value for `<input type="date">`. Returns an
 * empty string for nullish / invalid input.
 */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `<input type="date">` value (`yyyy-mm-dd`) into a `Date` at local
 * midnight, or `null` for an empty / invalid string.
 */
export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const bytesFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/**
 * Format a byte count as a human-readable size, e.g. `1,2 MB`. Uses binary
 * (1024) units and the Turkish decimal separator.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${bytesFormatter.format(value)} ${units[unitIndex]}`;
}

/**
 * Format the time remaining until a future date as a Turkish countdown, e.g.
 * "3 gün kaldı". For a past/elapsed date returns "süre doldu". Reads more
 * naturally than `formatRelativeTime`'s "... sonra" phrasing where the context
 * already means "remaining" (e.g. a snooze countdown).
 */
export function formatRemainingTime(value: Date | string, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (diffSeconds <= 0) return 'süre doldu';
  if (diffSeconds < 60) return '1 dakikadan az kaldı';
  if (diffSeconds < 60 * 60) return `${Math.round(diffSeconds / 60)} dakika kaldı`;
  if (diffSeconds < 24 * 60 * 60) return `${Math.round(diffSeconds / 3600)} saat kaldı`;
  if (diffSeconds < 30 * 24 * 60 * 60) return `${Math.round(diffSeconds / 86400)} gün kaldı`;
  if (diffSeconds < 365 * 24 * 60 * 60) {
    return `${Math.round(diffSeconds / (30 * 86400))} ay kaldı`;
  }
  return `${Math.round(diffSeconds / (365 * 86400))} yıl kaldı`;
}

/**
 * Format a due date as compact notification copy, device-local. Returns
 * "25 Haz Cmt" for a midnight (date-only) due date and "25 Haz 14:00" when a
 * time component is set — mirroring the worker's `formatDueTr` so push/email and
 * the in-app notification center read the same (the only difference is the
 * timezone: this one follows the viewer's browser). Returns `null` for nullish
 * or invalid input so callers can fall back to date-less copy.
 */
export function formatDueShort(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hasTime = midnightProbeFormatter.format(date) !== '00:00';
  if (hasTime) return dueShortTimeFormatter.format(date);
  return dueShortWeekdayFormatter.format(date);
}

/** Format a timestamp as a compact Turkish relative time, e.g. "2 dakika önce". */
export function formatRelativeTime(value: Date | string, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return relativeFormatter.format(0, 'second');
  if (abs < 45 * 60) return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 22 * 60 * 60) return relativeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 26 * 24 * 60 * 60)
    return relativeFormatter.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 320 * 24 * 60 * 60) {
    return relativeFormatter.format(Math.round(diffSeconds / (30 * 86400)), 'month');
  }
  return relativeFormatter.format(Math.round(diffSeconds / (365 * 86400)), 'year');
}
