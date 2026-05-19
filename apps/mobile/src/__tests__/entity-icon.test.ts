import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_ICON, ENTITY_ICONS } from '@pusula/domain';
import featherGlyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json';
import {
  entityIconToFeather,
  featherForEntityIcon,
  featherForEntityName,
} from '../lib/entity-icon';

/**
 * DEM-203 WP7 — `EntityIcon` → Feather ikon köprüsü birim testleri.
 *
 * `featherForEntityIcon` her domain ikonunu mobil `Icon` bileşeninin (`Feather`
 * seti) tanıdığı bir glyph adına eşlemeli. Glyph adları `@expo/vector-icons`'ın
 * Feather glyphmap'inden doğrulanır — eşleme bozulursa (lucide'de olup Feather'da
 * olmayan bir ada düşerse) test kırılır.
 */

/** Feather setinde geçerli tüm glyph adları. */
const validFeatherNames = new Set(Object.keys(featherGlyphs));

describe('featherForEntityIcon', () => {
  it('her ENTITY_ICONS girdisi geçerli bir Feather glyph adına eşlenir', () => {
    for (const icon of ENTITY_ICONS) {
      const feather = featherForEntityIcon(icon);
      expect(
        validFeatherNames.has(feather),
        `"${icon}" → "${feather}" geçerli bir Feather glyph adı değil`,
      ).toBe(true);
    }
  });

  it('eşleme tablosu ENTITY_ICONS ile birebir kapsama sağlar', () => {
    const mappedKeys = Object.keys(entityIconToFeather).sort();
    const domainKeys = [...ENTITY_ICONS].sort();
    expect(mappedKeys).toEqual(domainKeys);
  });

  it('doğrudan eşleşen ikonlar kendileriyle kalır', () => {
    // Feather'da birebir karşılığı olanlar değiştirilmemeli.
    expect(featherForEntityIcon('briefcase')).toBe('briefcase');
    expect(featherForEntityIcon('calendar')).toBe('calendar');
    expect(featherForEntityIcon('users')).toBe('users');
    expect(featherForEntityIcon('code')).toBe('code');
  });

  it('Feather karşılığı olmayan ikonlar en yakın glyphe düşer', () => {
    // `layout-grid` lucide'de var, Feather'da yok → `grid`.
    expect(featherForEntityIcon('layout-grid')).toBe('grid');
    // `crown` Feather'da yok → `award`.
    expect(featherForEntityIcon('crown')).toBe('award');
    // `sparkles` Feather'da yok → `star`.
    expect(featherForEntityIcon('sparkles')).toBe('star');
  });

  it('her ENTITY_ICONS girdisi için tanımsız dönmez', () => {
    for (const icon of ENTITY_ICONS) {
      expect(featherForEntityIcon(icon)).toBeTypeOf('string');
      expect(featherForEntityIcon(icon).length).toBeGreaterThan(0);
    }
  });
});

describe('featherForEntityName', () => {
  it('tanınan ikon adını featherForEntityIcon ile aynı glyphe çevirir', () => {
    for (const icon of ENTITY_ICONS) {
      expect(featherForEntityName(icon)).toBe(featherForEntityIcon(icon));
    }
  });

  it('tanınmayan / boş değer DEFAULT_WORKSPACE_ICON fallback glyphine düşer', () => {
    const fallback = featherForEntityIcon(DEFAULT_WORKSPACE_ICON);
    expect(featherForEntityName('olmayan-ikon')).toBe(fallback);
    expect(featherForEntityName('')).toBe(fallback);
    expect(featherForEntityName(null)).toBe(fallback);
    expect(featherForEntityName(undefined)).toBe(fallback);
  });
});
