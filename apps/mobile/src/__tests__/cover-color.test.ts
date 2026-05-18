import { describe, expect, it } from 'vitest';
import { CARD_COVER_COLORS } from '@pusula/domain';
import { asCoverColor, coverColorHex } from '../lib/cover-color';

/** DEM-201 — kart kapak rengi paleti helper'ı birim testleri. */

describe('coverColorHex', () => {
  it('12 CARD_COVER_COLORS adının her biri için hex değer taşır', () => {
    for (const color of CARD_COVER_COLORS) {
      expect(coverColorHex[color]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(Object.keys(coverColorHex)).toHaveLength(CARD_COVER_COLORS.length);
  });
});

describe('asCoverColor', () => {
  it('geçerli palet adını daraltır', () => {
    expect(asCoverColor('mavi')).toBe('mavi');
    expect(asCoverColor('siyah')).toBe('siyah');
  });

  it('geçersiz / boş girdi → null', () => {
    expect(asCoverColor(null)).toBeNull();
    expect(asCoverColor(undefined)).toBeNull();
    expect(asCoverColor('beyaz')).toBeNull();
    expect(asCoverColor('')).toBeNull();
  });
});
