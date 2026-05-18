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
