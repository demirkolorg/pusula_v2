import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILY_IDS,
  isFontFamilyId,
  resolveFontFamily,
} from './font-families';

/**
 * §13.7.7 Faz 3 — yazı tipi ailesi çözümleme (TTF-bağımsız saf mantık).
 * `resolveFontFamily` aktif aile + ağırlık için RN `fontFamily` adını verir;
 * eksik ağırlıkta en yakına düşer, `system`'de `undefined` (platform fontu).
 */

describe('FONT_FAMILY_IDS', () => {
  it('8 seçenek içerir ve varsayılan listededir', () => {
    expect(FONT_FAMILY_IDS).toHaveLength(8);
    expect(FONT_FAMILY_IDS).toContain(DEFAULT_FONT_FAMILY);
  });

  it('her id geçerli olarak doğrulanır', () => {
    for (const id of FONT_FAMILY_IDS) {
      expect(isFontFamilyId(id)).toBe(true);
    }
  });
});

describe('resolveFontFamily', () => {
  it('varsayılan aile için her ağırlığı doğru variant\'a eşler', () => {
    expect(resolveFontFamily('poppins', 'regular')).toBe('Poppins_400Regular');
    expect(resolveFontFamily('poppins', 'medium')).toBe('Poppins_500Medium');
    expect(resolveFontFamily('poppins', 'semibold')).toBe('Poppins_600SemiBold');
    expect(resolveFontFamily('poppins', 'bold')).toBe('Poppins_700Bold');
  });

  it('mono aile için ayrı ağırlıkları seçer', () => {
    expect(resolveFontFamily('jetbrains-mono', 'semibold')).toBe(
      'JetBrainsMono_600SemiBold',
    );
  });

  it('system için undefined döner (platform varsayılanı)', () => {
    expect(resolveFontFamily('system', 'regular')).toBeUndefined();
    expect(resolveFontFamily('system', 'bold')).toBeUndefined();
  });

  it('Atkinson eksik ara ağırlıkları en yakına düşürür', () => {
    // 400 + 700 dışında ağırlık yok: medium → regular, semibold → bold.
    expect(resolveFontFamily('atkinson', 'regular')).toBe('AtkinsonHyperlegible_400Regular');
    expect(resolveFontFamily('atkinson', 'medium')).toBe('AtkinsonHyperlegible_400Regular');
    expect(resolveFontFamily('atkinson', 'semibold')).toBe('AtkinsonHyperlegible_700Bold');
    expect(resolveFontFamily('atkinson', 'bold')).toBe('AtkinsonHyperlegible_700Bold');
  });
});
