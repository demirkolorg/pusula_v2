import { describe, expect, it } from 'vitest';
import { COLOR_THEMES, colorThemeVars } from '../color-themes.generated';
import { tokens } from '../tokens';
import {
  DEFAULT_COLOR_THEME,
  isColorThemeName,
} from '../theme-preference';
import { themeFor } from '../tokens';

/**
 * §13.7.7 renk paleti altyapısı — generator çıktısı + `themeFor` override.
 * Değerler web `packages/ui/src/styles/theme.css` oklch'ından üretilir;
 * burada üretim bütünlüğü + geriye dönük uyum doğrulanır.
 */
describe('renk paleti altyapısı (§13.7.7)', () => {
  it('15 paleti emerald varsayılan başta listeler', () => {
    expect(COLOR_THEMES).toHaveLength(15);
    expect(COLOR_THEMES[0]).toBe('emerald');
    expect(DEFAULT_COLOR_THEME).toBe('emerald');
  });

  it('her palet light + dark için tam --color-* token seti üretir', () => {
    const expectedKeys = Object.keys(colorThemeVars.emerald.light);
    expect(expectedKeys.length).toBeGreaterThanOrEqual(20);
    for (const name of COLOR_THEMES) {
      for (const mode of ['light', 'dark'] as const) {
        const vars = colorThemeVars[name][mode];
        expect(Object.keys(vars)).toEqual(expectedKeys);
        // Tüm değerler "R G B" kanal formatında (0-255 ×3).
        for (const value of Object.values(vars)) {
          expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
        }
      }
    }
  });

  it('üretilen değerler web theme.css oklch karşılıklarıyla eşleşir', () => {
    // Bağımsız oklch→rgb referansı (verify adımıyla aynı):
    expect(colorThemeVars.emerald.light['--color-primary']).toBe('0 145 91');
    expect(colorThemeVars.emerald.dark['--color-primary']).toBe('2 166 113');
    expect(colorThemeVars.blue.light['--color-primary']).toBe('0 112 229');
    expect(colorThemeVars.violet.light['--color-primary']).toBe('128 71 225');
    // Hex kaynaklı paletler birebir:
    expect(colorThemeVars.whatsapp.light['--color-primary']).toBe('7 94 84'); // #075e54
    expect(colorThemeVars.discord.light['--color-primary']).toBe('88 101 242'); // #5865f2
  });

  it('dark border translucent değil (kart üzerine flatten edilmiş)', () => {
    // Web dark --border = oklch(1 0 0 / 14%); opak beyaz OLMAMALI.
    expect(colorThemeVars.emerald.dark['--color-border']).not.toBe('255 255 255');
  });

  it('isColorThemeName ham değeri daraltır', () => {
    expect(isColorThemeName('blue')).toBe(true);
    expect(isColorThemeName('emerald')).toBe(true);
    expect(isColorThemeName('mor')).toBe(false);
    expect(isColorThemeName(null)).toBe(false);
    expect(isColorThemeName(42)).toBe(false);
  });

  it('themeFor: emerald dahil tüm paletler generated tablodan türer (tek kaynak)', () => {
    // Sırıtma fix: emerald artık baz nesneyi short-circuit ETMEZ — JS token
    // (`theme.card`) generated `colorThemeVars` ile (NativeWind `bg-card` vars
    // kaynağı) birebir aynı `card` rengini döndürmeli, aksi halde SwipeRow ile
    // DetailSection dark'ta sırıtır.
    const emeraldDark = themeFor('dark', 'emerald');
    const expectedCard = colorThemeVars.emerald.dark['--color-card'] ?? '';
    const [r, g, b] = expectedCard.split(' ').map(Number);
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    expect(emeraldDark.card).toBe(`#${toHex(r!)}${toHex(g!)}${toHex(b!)}`);
    // `themeFor()` (palet argümansız) varsayılan emerald ile aynı sonucu verir.
    expect(themeFor('dark').card).toBe(emeraldDark.card);
    // Common token'lar (palet override etmez) baz şemadan korunur.
    expect(emeraldDark.radius).toBe(tokens.dark.radius);
  });

  it('themeFor: farklı palet override edilmiş primary + sabit common döndürür', () => {
    const blueLight = themeFor('light', 'blue');
    // `channelsToHex` ile HEX döner (palet tüketicileri hex varsayar — tokens.ts).
    expect(blueLight.primary).toBe('#0070e5');
    expect(blueLight.primarySoft).toBe('rgba(0, 112, 229, 0.14)');
    // Durum renkleri + common token'lar baz şemadan korunur (palet override etmez).
    expect(blueLight.success).toBe(tokens.light.success);
    expect(blueLight.radius).toBe(tokens.light.radius);
    expect(blueLight.tabBarActive).toBe('#0070e5');
  });
});
