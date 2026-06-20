import { paletteColors } from '@/theme/tokens';

/**
 * Board kapak rengini (`boards.background`) mobil için **tek bir hex renge**
 * çözer. Web tarafı (`@pusula/ui` `boardBackgroundClass`) gradient/solid
 * değerlerini CSS class'larına çevirir; mobilde gradient render için native
 * bağımlılık (`expo-linear-gradient`) gerekir — EAS build kotası kısıtı
 * (memory: kota dolu, OTA şart) nedeniyle gradient'leri **baskın tek renkle**
 * temsil ederiz. Bu dosya saf JS → OTA ile dağıtılır, native build gerekmez.
 *
 * `background` formatı: `solid:<ad>` | `gradient:<ad>` | null.
 * Bilinmeyen/null değer → `null` (çağıran nötr varsayılana düşer).
 */

/** Düz renk paleti — `paletteColors` (12 ad) + board-özel nötr varyantlar. */
const SOLID_HEX: Record<string, string> = {
  ...paletteColors,
  siyah: '#1f2024',
  beyaz: '#ffffff',
  'kirik-beyaz': '#f5f3ee',
  fildisi: '#f7f4ea',
  'buz-beyazi': '#eef3f6',
  gumus: '#cdd2d8',
};

/**
 * Gradient adının baskın/temsili tek rengi. Web'deki çok-duraklı gradient'lerin
 * mobil karşılığı; küçük kapak şeridi için tek renk yeterli (Trello mobil de
 * minik kapaklarda solid kullanır).
 */
const GRADIENT_HEX: Record<string, string> = {
  sunset: '#fb7185',
  ocean: '#3b82f6',
  rainbow: '#a855f7',
  forest: '#16a34a',
  lavender: '#a78bfa',
  sunrise: '#fb923c',
  midnight: '#1e3a8a',
  mint: '#34d399',
  aurora: '#22d3ee',
  coral: '#fb7185',
  lagoon: '#0ea5e9',
  ember: '#f97316',
  blossom: '#f472b6',
  meadow: '#65a30d',
  dusk: '#7c3aed',
  pearl: '#cbd5e1',
  'trello-bubble': '#60a5fa',
  'trello-snow': '#94a3b8',
  'trello-ocean': '#0284c7',
  'trello-crystal': '#38bdf8',
  'trello-rainbow': '#c084fc',
  'trello-peach': '#fb923c',
  'trello-flower': '#ec4899',
  'trello-earth': '#a16207',
  'trello-alien': '#22c55e',
  'trello-volcano': '#ef4444',
};

/**
 * `boards.background` → kapak şeridi/bloku için hex renk. Renk seçili değilse
 * (null / bilinmeyen) `null` döner; çağıran nötr (border/muted) yüzeye düşer.
 */
export function boardBackgroundColor(
  background: string | null | undefined,
): string | null {
  if (background == null) return null;

  const sep = background.indexOf(':');
  if (sep <= 0) return null;

  const kind = background.slice(0, sep);
  const name = background.slice(sep + 1);

  if (kind === 'solid') return SOLID_HEX[name] ?? null;
  if (kind === 'gradient') return GRADIENT_HEX[name] ?? null;
  return null;
}
