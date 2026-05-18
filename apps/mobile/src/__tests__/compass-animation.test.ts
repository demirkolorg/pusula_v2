import { describe, expect, it } from 'vitest';
import compassSpinner from '@/assets/compass-spinner.json';
import { hexToLottieRgb, tintCompassAnimation } from '@/lib/compass-animation';

/** Faz 7 — compass spinner Lottie boyama helper'ı birim testleri. */

describe('hexToLottieRgb', () => {
  it('#rrggbb değerini 0–1 RGB üçlüsüne çevirir', () => {
    expect(hexToLottieRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToLottieRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('# olmadan ve 3-haneli kısa biçimi kabul eder', () => {
    expect(hexToLottieRgb('fff')).toEqual([1, 1, 1]);
  });

  it('geçersiz hex değerini reddeder', () => {
    expect(() => hexToLottieRgb('#zzz')).toThrow();
  });
});

describe('tintCompassAnimation', () => {
  it('tüm fill shape dolgularını verilen renge boyar', () => {
    const fills = collectFills(tintCompassAnimation('#ffffff'));
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) expect(fill).toEqual([1, 1, 1]);
  });

  it('kaynak animasyon modülünü mutasyona uğratmaz', () => {
    const before = JSON.stringify(compassSpinner);
    tintCompassAnimation('#abcdef');
    expect(JSON.stringify(compassSpinner)).toBe(before);
  });
});

/** Lottie ağacındaki tüm `fl` shape dolgu renklerini toplar. */
function collectFills(node: unknown, acc: number[][] = []): number[][] {
  if (Array.isArray(node)) {
    for (const child of node) collectFills(child, acc);
    return acc;
  }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record.ty === 'fl') {
      const k = (record.c as { k?: unknown } | undefined)?.k;
      if (Array.isArray(k)) acc.push(k as number[]);
    }
    for (const value of Object.values(record)) collectFills(value, acc);
  }
  return acc;
}
