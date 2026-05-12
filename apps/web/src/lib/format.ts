/**
 * Small locale-aware formatting helpers for the web app. Centralized so the
 * eventual i18n swap (locale-driven `Intl` options) is a single seam, the same
 * way `strings.ts` centralizes copy.
 */

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

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
