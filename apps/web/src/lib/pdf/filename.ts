/**
 * Faz 14E — Klasik pano PDF için dosya adı üretici (DEM-295).
 *
 * 14A karar 9 pattern: `{pano-slug}-raporu-{YYYY-MM-DD}.pdf`. Tarih yerel TR
 * (Europe/Istanbul) günü; slug ASCII-clean Türkçe-uyumlu (ç/ğ/ı/ö/ş/ü → c/g/i/o/s/u).
 *
 * Content-Disposition iki varyant döner:
 *   - `ascii`  — yasal/eski tarayıcılar için (`filename=`).
 *   - `utf8`   — modern tarayıcılar için (`filename*=UTF-8''`); kullanıcı orijinal
 *     başlığı görür ("Bayrampaşa Belediyesi-raporu-2026-05-25.pdf").
 *
 * `Content-Disposition` header pattern (RFC 5987):
 *   attachment; filename="{ascii}"; filename*=UTF-8''{encodeURIComponent(utf8)}
 */
const TURKISH_TO_ASCII: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

function turkishToAscii(input: string): string {
  let out = '';
  for (const ch of input) out += TURKISH_TO_ASCII[ch] ?? ch;
  return out;
}

/** "Bayrampaşa Belediyesi  Pano!" → "bayrampasa-belediyesi-pano" */
export function asciiSlug(input: string): string {
  const lowered = turkishToAscii(input).toLowerCase();
  // NFKD ile Unicode aksanları sök, combining mark'leri at.
  const stripped = lowered.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return stripped
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Verilen tarih için Europe/Istanbul'a göre YYYY-MM-DD üretir. */
export function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export interface ClassicReportFilename {
  /** ASCII-clean (legacy `filename=` header). */
  ascii: string;
  /** Türkçe karakterli orijinal (`filename*=UTF-8''` header). */
  utf8: string;
}

export function makeClassicReportFilename(
  boardTitle: string,
  date: Date,
): ClassicReportFilename {
  const slug = asciiSlug(boardTitle) || 'pano';
  const dateStr = formatReportDate(date);
  const ascii = `${slug}-raporu-${dateStr}.pdf`;
  const utf8Title = boardTitle.trim() || 'Pano';
  const utf8 = `${utf8Title}-raporu-${dateStr}.pdf`;
  return { ascii, utf8 };
}

/** RFC 5987 + RFC 6266 uyumlu Content-Disposition header değeri. */
export function contentDispositionFor(filename: ClassicReportFilename): string {
  return `attachment; filename="${filename.ascii}"; filename*=UTF-8''${encodeURIComponent(filename.utf8)}`;
}
