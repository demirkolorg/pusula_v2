/**
 * DEM-209 — liste (`lists.icon` / `LIST_ICONS`) → mobil Feather `IconName`
 * köprüsü + liste rengi/ikon-rengi token → hex çözücüleri.
 *
 * Web liste başlığı `LIST_ICON_COMPONENTS` ile `lucide-react` bileşenlerini
 * birebir render eder; mobil `Icon` bileşeni `@expo/vector-icons` Feather seti
 * kullanır (`icon.tsx`) ve Feather, lucide kadar geniş değildir. Bu modül her
 * `LIST_ICONS` token'ını en yakın Feather glyph'ine eşler; doğrudan karşılığı
 * olanlar kendileriyle kalır.
 *
 * `LIST_ICONS` web ikon seti `ENTITY_ICONS`'tan **ayrıdır** (`circle`,
 * `list-todo`, `square-check` gibi token'lar yalnız liste setinde) — bu yüzden
 * `entity-icon.ts` köprüsü liste ikonu için kullanılamaz.
 *
 * `LIST_ICONS` genişlerse buraya yeni satır eklenir — eksik anahtar tip hatası
 * verir (`Record<ListIcon, IconName>` tam kapsama zorlar).
 */
import {
  LIST_COLORS,
  LIST_ICONS,
  LIST_ICON_COLORS,
  type ListColor,
  type ListIcon,
  type ListIconColor,
} from '@pusula/domain';
import type { IconName } from '@/components/icon';
import { paletteColors } from '@/theme/tokens';

/** Liste ikon token'ından mobil Feather ikon adına tam eşleme. */
export const listIconToFeather: Record<ListIcon, IconName> = {
  // status / shape — Feather'da `circle-*` türevleri yok; `circle`/`disc`.
  circle: 'circle',
  'circle-dot': 'disc',
  'circle-dashed': 'circle',
  'circle-check': 'check-circle',
  'circle-alert': 'alert-circle',
  check: 'check',
  'square-check': 'check-square',
  // flow
  list: 'list',
  'list-todo': 'list',
  'list-checks': 'list',
  layers: 'layers',
  play: 'play',
  pause: 'pause',
  hourglass: 'clock',
  timer: 'clock',
  'alarm-clock': 'watch',
  // emphasis
  star: 'star',
  flag: 'flag',
  bookmark: 'bookmark',
  tag: 'tag',
  pin: 'map-pin',
  sparkles: 'star',
  lightbulb: 'zap',
  heart: 'heart',
  'thumbs-up': 'thumbs-up',
  // time
  clock: 'clock',
  calendar: 'calendar',
  // people
  user: 'user',
  users: 'users',
  // comms
  bell: 'bell',
  'message-square': 'message-square',
  mail: 'mail',
  // work
  briefcase: 'briefcase',
  target: 'target',
  rocket: 'send',
  zap: 'zap',
  trophy: 'award',
  award: 'award',
  'trending-up': 'trending-up',
  activity: 'activity',
  // files
  folder: 'folder',
  'file-text': 'file-text',
  paperclip: 'paperclip',
  inbox: 'inbox',
  archive: 'archive',
  package: 'package',
  // alerts / tools
  'triangle-alert': 'alert-triangle',
  lock: 'lock',
  bug: 'alert-octagon',
  wrench: 'tool',
  hammer: 'tool',
  gift: 'gift',
  coffee: 'coffee',
};

/**
 * Liste ikon rengi paleti (`LIST_ICON_COLORS`) → hex. `paletteColors` 11 renk
 * taşır (`siyah` yok); 12. renk `siyah` burada eklenir (`cover-color.ts` ile
 * aynı yaklaşık hex).
 */
const listIconColorHex: Record<ListIconColor, string> = {
  ...paletteColors,
  siyah: '#33363d',
};

const LIST_COLOR_SET = new Set<string>(LIST_COLORS);
const LIST_ICON_SET = new Set<string>(LIST_ICONS);
const LIST_ICON_COLOR_SET = new Set<string>(LIST_ICON_COLORS);

/**
 * `board.get` liste `color`'ı düz `text` (`string | null`) döner; geçerli bir
 * `LIST_COLORS` adıysa `ListColor`'a daraltır, değilse `null` (web
 * `list-column.tsx` `asListColor` simetrisi).
 */
export function asListColor(value: string | null | undefined): ListColor | null {
  return value != null && LIST_COLOR_SET.has(value) ? (value as ListColor) : null;
}

/** Liste `icon` token'ını geçerliyse `ListIcon`'a daraltır, değilse `null`. */
export function asListIcon(value: string | null | undefined): ListIcon | null {
  return value != null && LIST_ICON_SET.has(value) ? (value as ListIcon) : null;
}

/** Liste `iconColor` token'ını geçerliyse `ListIconColor`'a daraltır, değilse `null`. */
export function asListIconColor(value: string | null | undefined): ListIconColor | null {
  return value != null && LIST_ICON_COLOR_SET.has(value) ? (value as ListIconColor) : null;
}

/** Bir `ListIcon`'u mobil `Icon` bileşeninin beklediği Feather adına çevirir. */
export function featherForListIcon(icon: ListIcon): IconName {
  return listIconToFeather[icon];
}

/** Liste renk token'ının hex karşılığı; bilinmeyen token → `null`. */
export function listColorHex(value: string | null | undefined): string | null {
  const color = asListColor(value);
  return color != null ? paletteColors[color] : null;
}

/** Liste ikon-rengi token'ının hex karşılığı; bilinmeyen / `null` token → `null`. */
export function listIconColorToHex(value: string | null | undefined): string | null {
  const color = asListIconColor(value);
  return color != null ? listIconColorHex[color] : null;
}
