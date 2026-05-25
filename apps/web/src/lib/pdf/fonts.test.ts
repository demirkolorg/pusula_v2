import { beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn();

vi.mock('@react-pdf/renderer', () => ({
  Font: { register },
}));

beforeEach(async () => {
  register.mockClear();
  const mod = await import('./fonts');
  mod.__resetFontRegistrationForTests();
});

describe('registerReportFonts', () => {
  it('Roboto ailesini 4 ağırlıkla (300/400/500/700) tek seferde kaydeder, src local TTF absolute path', async () => {
    const { registerReportFonts } = await import('./fonts');

    registerReportFonts();

    expect(register).toHaveBeenCalledTimes(1);
    const [call] = register.mock.calls;
    expect(call?.[0]).toMatchObject({ family: 'Roboto' });
    const fonts = (call?.[0] as { fonts: { src: string; fontWeight: number }[] }).fonts;
    expect(fonts.map((f) => f.fontWeight)).toEqual([300, 400, 500, 700]);
    // 14F revize: src local TTF path (`apps/web/public/fonts/roboto-*.ttf`).
    // CDN değil — Google Fonts gstatic URL'leri stabil değil (v30 → v51).
    expect(fonts.every((f) => /[\\/]public[\\/]fonts[\\/]roboto-(light|regular|medium|bold)\.ttf$/.test(f.src))).toBe(true);
  });

  it('idempotent — birden fazla çağrılırsa Font.register yalnız bir kez tetiklenir', async () => {
    const { registerReportFonts } = await import('./fonts');

    registerReportFonts();
    registerReportFonts();
    registerReportFonts();

    expect(register).toHaveBeenCalledTimes(1);
  });
});
