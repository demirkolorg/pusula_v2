/**
 * Tarih biçimleme — kart due tarihi için. `Intl` yerine elle Türkçe ay
 * kısaltması: deterministik, test edilebilir, platform/Hermes farkından
 * bağımsız.
 */
const TR_MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Kısa Türkçe tarih, örn. "12 May". Geçersiz tarihte boş string. */
export function formatDueDate(value: Date | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${TR_MONTHS_SHORT[date.getMonth()]}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Tarih + saat, örn. "12 May, 14:30" — yorum/aktivite zaman damgaları için. */
export function formatTimestamp(value: Date | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getDate()} ${TR_MONTHS_SHORT[date.getMonth()]}`;
  return `${day}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Verilen tarih şu andan önce mi (gecikmiş due tespiti). `cards.dueAt` tam
 * timestamp olduğundan ms hassasiyetli karşılaştırma kullanılır — due anı
 * geçince kart gecikmiş sayılır (web ile aynı davranış).
 */
export function isOverdue(value: Date | string): boolean {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

/**
 * Kompakt Türkçe göreli zaman, örn. "az önce", "3 dk önce", "2 sa önce",
 * "5 gün önce" (Faz 7K — bildirim merkezi satır zaman damgaları).
 *
 * `Intl.RelativeTimeFormat` yerine elle Türkçe: deterministik, test
 * edilebilir, Hermes/platform farkından bağımsız (web `formatRelativeTime`
 * `Intl` kullanır; mobil `format-date.ts` deseni elle çeviridir). Geçersiz
 * tarihte boş string.
 */
export function formatRelativeTime(value: Date | string, now: Date = new Date()): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  // Gelecek tarih (saat kayması) veya çok yakın geçmiş → "az önce".
  if (diffSeconds < 45) return 'az önce';
  if (diffSeconds < 45 * 60) return `${Math.round(diffSeconds / 60)} dk önce`;
  if (diffSeconds < 22 * 60 * 60) return `${Math.round(diffSeconds / 3600)} sa önce`;
  if (diffSeconds < 26 * 24 * 60 * 60) return `${Math.round(diffSeconds / 86400)} gün önce`;
  if (diffSeconds < 320 * 24 * 60 * 60) {
    return `${Math.round(diffSeconds / (30 * 86400))} ay önce`;
  }
  return `${Math.round(diffSeconds / (365 * 86400))} yıl önce`;
}
