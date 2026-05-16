/**
 * Small locale-aware formatting helpers for the web app. Centralized so the
 * eventual i18n swap (locale-driven `Intl` options) is a single seam, the same
 * way `strings.ts` centralizes copy.
 */

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });
const relativeFormatter = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/** Format a date for display (medium, Turkish locale). Accepts a `Date` or ISO string. */
export function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.format(date);
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
