import { describe, expect, it } from 'vitest';
import { strings } from '../lib/strings';
import { paletteColors, themeFor, tokens } from '../theme/tokens';

/**
 * Faz 7A — iskelet birim testleri (saf sabitler). RN bileşen testleri
 * Faz 7N test altyapısında eklenir.
 */
describe('mobil iskelet sabitleri', () => {
  it('app adını taşır', () => {
    expect(strings.app.name).toBe('Pusula');
  });

  it('tema light/dark setlerini hex renklerle tanımlar', () => {
    expect(tokens.light.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens.dark.background).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('themeFor null/light → light, dark → dark döndürür', () => {
    expect(themeFor(null)).toBe(tokens.light);
    expect(themeFor('light')).toBe(tokens.light);
    expect(themeFor('dark')).toBe(tokens.dark);
  });

  it('etiket paleti 11 tema-bağımsız renk taşır', () => {
    expect(Object.keys(paletteColors)).toHaveLength(11);
  });
});
