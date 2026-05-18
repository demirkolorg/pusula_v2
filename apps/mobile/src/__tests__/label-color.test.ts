import { describe, expect, it } from 'vitest';
import { labelColorHex } from '../lib/label-color';

/**
 * Faz 7N — `label-color.ts` saf eşleme birim testleri. `labelColorHex`,
 * `@pusula/domain` İngilizce renk anahtarını (`green` / `red` / …) UI tasarım
 * dili paletindeki hex değere çevirir; bilinmeyen anahtar nötr griye düşer.
 */
const FALLBACK_HEX = '#8c8f97';

describe('labelColorHex', () => {
  it('bilinen renk anahtarlarını hex değere çevirir', () => {
    expect(labelColorHex('green')).toBe('#4bce97');
    expect(labelColorHex('yellow')).toBe('#eed12b');
    expect(labelColorHex('orange')).toBe('#fca700');
    expect(labelColorHex('red')).toBe('#f87168');
    expect(labelColorHex('purple')).toBe('#c97cf4');
    expect(labelColorHex('blue')).toBe('#669df1');
    expect(labelColorHex('sky')).toBe('#6cc3e0');
    expect(labelColorHex('lime')).toBe('#94c748');
    expect(labelColorHex('pink')).toBe('#e774bb');
    expect(labelColorHex('black')).toBe('#42526e');
  });

  it('her bilinen renk geçerli 6 haneli hex döndürür', () => {
    const keys = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'];
    for (const key of keys) {
      expect(labelColorHex(key)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('bilinmeyen anahtar için nötr griye düşer', () => {
    expect(labelColorHex('teal')).toBe(FALLBACK_HEX);
    expect(labelColorHex('bilinmeyen')).toBe(FALLBACK_HEX);
  });

  it('boş string için nötr griye düşer', () => {
    expect(labelColorHex('')).toBe(FALLBACK_HEX);
  });

  it('büyük/küçük harf duyarlıdır — yanlış kasalı anahtar eşleşmez', () => {
    expect(labelColorHex('GREEN')).toBe(FALLBACK_HEX);
    expect(labelColorHex('Red')).toBe(FALLBACK_HEX);
  });

  it('hex değerin kendisi anahtar olarak verilirse nötr griye düşer', () => {
    expect(labelColorHex('#4bce97')).toBe(FALLBACK_HEX);
  });

  it('palet anahtarı olmayan rastgele girdiler nötr griye düşer', () => {
    expect(labelColorHex('gray')).toBe(FALLBACK_HEX);
    expect(labelColorHex('mor')).toBe(FALLBACK_HEX);
    expect(labelColorHex('123')).toBe(FALLBACK_HEX);
  });
});
