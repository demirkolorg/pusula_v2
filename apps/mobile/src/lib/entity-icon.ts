/**
 * DEM-203 WP6 — `EntityIcon` (domain `ENTITY_ICONS`) → Feather `IconName` köprüsü.
 *
 * Web `lucide-react` ile `ENTITY_ICONS` adlarını birebir render eder; mobil
 * `Icon` bileşeni `@expo/vector-icons` Feather seti kullanır (`icon.tsx`) ve
 * Feather, lucide kadar geniş değildir. Bu modül her domain ikonunu en yakın
 * Feather glyph'ine eşler; doğrudan eşleşmesi olanlar kendileriyle kalır.
 *
 * `ENTITY_ICONS` genişlerse buraya yeni satır eklenir — eksik anahtar tip
 * hatası verir (`Record<EntityIcon, IconName>` tam kapsama zorlar).
 */
import type { EntityIcon } from '@pusula/domain';
import type { IconName } from '@/components/icon';

/** Domain ikon adından mobil Feather ikon adına tam eşleme. */
export const entityIconToFeather: Record<EntityIcon, IconName> = {
  // layout — Feather'da `layout-*` türevleri yok; `grid`/`layout`/`list`.
  'layout-grid': 'grid',
  'layout-dashboard': 'layout',
  'layout-list': 'list',
  // organisation
  briefcase: 'briefcase',
  folder: 'folder',
  'folder-open': 'folder-plus',
  building: 'home',
  factory: 'home',
  store: 'shopping-bag',
  home: 'home',
  archive: 'archive',
  inbox: 'inbox',
  package: 'package',
  boxes: 'box',
  // people
  users: 'users',
  user: 'user',
  network: 'share-2',
  // goals
  target: 'target',
  rocket: 'send',
  flag: 'flag',
  trophy: 'award',
  award: 'award',
  crown: 'award',
  gem: 'aperture',
  zap: 'zap',
  'trending-up': 'trending-up',
  // emphasis
  star: 'star',
  bookmark: 'bookmark',
  heart: 'heart',
  sparkles: 'star',
  lightbulb: 'zap',
  // time
  calendar: 'calendar',
  clock: 'clock',
  // places
  map: 'map',
  compass: 'compass',
  globe: 'globe',
  // knowledge
  'book-open': 'book-open',
  'clipboard-list': 'clipboard',
  'graduation-cap': 'book',
  puzzle: 'box',
  // tech
  code: 'code',
  terminal: 'terminal',
  database: 'database',
  server: 'server',
  // creative
  palette: 'feather',
  camera: 'camera',
  music: 'music',
  // nature
  leaf: 'feather',
  sun: 'sun',
  // comms / misc
  shield: 'shield',
  bell: 'bell',
  megaphone: 'volume-2',
  'shopping-cart': 'shopping-cart',
};

/** Bir `EntityIcon`'u mobil `Icon` bileşeninin beklediği Feather adına çevirir. */
export function featherForEntityIcon(icon: EntityIcon): IconName {
  return entityIconToFeather[icon];
}
