import { describe, expect, it } from 'vitest';
import { LIST_COLORS, LIST_ICONS, LIST_ICON_COLORS } from '@pusula/domain';
import featherGlyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json';
import {
  asListColor,
  asListIcon,
  asListIconColor,
  featherForListIcon,
  listColorHex,
  listIconColorToHex,
  listIconToFeather,
} from '../lib/list-icon';

/**
 * DEM-209 — liste rengi/ikonu helper'ları birim testleri.
 *
 * `featherForListIcon` her `LIST_ICONS` token'ını mobil `Icon` bileşeninin
 * (`Feather` seti) tanıdığı bir glyph adına eşlemeli; glyph adları
 * `@expo/vector-icons`'ın Feather glyphmap'inden doğrulanır.
 */

/** Feather setinde geçerli tüm glyph adları. */
const validFeatherNames = new Set(Object.keys(featherGlyphs));

describe('featherForListIcon', () => {
  it('her LIST_ICONS girdisi geçerli bir Feather glyph adına eşlenir', () => {
    for (const icon of LIST_ICONS) {
      const feather = featherForListIcon(icon);
      expect(
        validFeatherNames.has(feather),
        `"${icon}" → "${feather}" geçerli bir Feather glyph adı değil`,
      ).toBe(true);
    }
  });

  it('eşleme tablosu LIST_ICONS ile birebir kapsama sağlar', () => {
    const mappedKeys = Object.keys(listIconToFeather).sort();
    const domainKeys = [...LIST_ICONS].sort();
    expect(mappedKeys).toEqual(domainKeys);
  });

  it('doğrudan eşleşen ikonlar kendileriyle kalır', () => {
    expect(featherForListIcon('star')).toBe('star');
    expect(featherForListIcon('calendar')).toBe('calendar');
    expect(featherForListIcon('users')).toBe('users');
    expect(featherForListIcon('archive')).toBe('archive');
  });

  it('Feather karşılığı olmayan ikonlar en yakın glyphe düşer', () => {
    // `circle-check` lucide'de var, Feather'da yok → `check-circle`.
    expect(featherForListIcon('circle-check')).toBe('check-circle');
    // `triangle-alert` Feather'da `alert-triangle`.
    expect(featherForListIcon('triangle-alert')).toBe('alert-triangle');
    // `rocket` Feather'da yok → `send`.
    expect(featherForListIcon('rocket')).toBe('send');
  });
});

describe('asListColor / asListIcon / asListIconColor', () => {
  it('geçerli token daraltılır', () => {
    expect(asListColor('kirmizi')).toBe('kirmizi');
    expect(asListIcon('star')).toBe('star');
    expect(asListIconColor('mavi')).toBe('mavi');
    expect(asListIconColor('siyah')).toBe('siyah');
  });

  it('geçersiz / null / undefined girdi → null', () => {
    expect(asListColor(null)).toBeNull();
    expect(asListColor(undefined)).toBeNull();
    expect(asListColor('beyaz')).toBeNull();
    expect(asListIcon('layout-grid')).toBeNull();
    expect(asListIconColor('')).toBeNull();
  });
});

describe('listColorHex', () => {
  it('her LIST_COLORS adı için hex değer döner', () => {
    for (const color of LIST_COLORS) {
      expect(listColorHex(color)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('bilinmeyen / null token → null', () => {
    expect(listColorHex(null)).toBeNull();
    expect(listColorHex(undefined)).toBeNull();
    expect(listColorHex('beyaz')).toBeNull();
  });
});

describe('listIconColorToHex', () => {
  it('her LIST_ICON_COLORS adı için hex değer döner', () => {
    for (const color of LIST_ICON_COLORS) {
      expect(listIconColorToHex(color)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('bilinmeyen / null token → null', () => {
    expect(listIconColorToHex(null)).toBeNull();
    expect(listIconColorToHex(undefined)).toBeNull();
    expect(listIconColorToHex('beyaz')).toBeNull();
  });
});
