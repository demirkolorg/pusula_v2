import { describe, expect, it } from 'vitest';
import { deviceLabel, pushPlatform } from '@/lib/push-device';

/**
 * `push-device.ts` birim testleri (Faz 7K) — push token kaydı saf parçaları.
 */
describe('pushPlatform', () => {
  it('ios ve android olduğu gibi geçer', () => {
    expect(pushPlatform('ios')).toBe('ios');
    expect(pushPlatform('android')).toBe('android');
  });

  it('beklenmeyen platformu web\'e düşürür', () => {
    expect(pushPlatform('windows')).toBe('web');
    expect(pushPlatform('macos')).toBe('web');
    expect(pushPlatform('')).toBe('web');
  });
});

describe('deviceLabel', () => {
  it('cihaz adını tercih eder', () => {
    expect(deviceLabel({ deviceName: "Abdullah'ın iPhone", os: 'ios' })).toBe(
      "Abdullah'ın iPhone",
    );
  });

  it('cihaz adı yoksa model adına düşer', () => {
    expect(deviceLabel({ deviceName: null, modelName: 'Pixel 8', os: 'android' })).toBe(
      'Pixel 8',
    );
  });

  it('ad/model yoksa platform adına düşer', () => {
    expect(deviceLabel({ os: 'ios' })).toBe('iOS cihazı');
    expect(deviceLabel({ os: 'android' })).toBe('Android cihazı');
    expect(deviceLabel({ os: 'web' })).toBe('Cihaz');
  });

  it('boş/boşluklu adı yok sayar', () => {
    expect(deviceLabel({ deviceName: '   ', modelName: 'iPad', os: 'ios' })).toBe('iPad');
  });

  it('120 karakterden uzun adı kırpar', () => {
    const long = 'A'.repeat(200);
    expect(deviceLabel({ deviceName: long, os: 'ios' })).toHaveLength(120);
  });
});
