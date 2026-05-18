import { describe, expect, it } from 'vitest';
import {
  QUIET_HOURS_DEFAULT_TIMEZONE,
  hasQuietWindow,
  isValidQuietTime,
  resolveQuietHours,
} from '@/lib/quiet-hours';

/**
 * `quiet-hours.ts` birim testleri (Faz 7K) — sessiz saat doğrulaması.
 */
describe('isValidQuietTime', () => {
  it('geçerli HH:MM kabul eder', () => {
    expect(isValidQuietTime('00:00')).toBe(true);
    expect(isValidQuietTime('23:59')).toBe(true);
    expect(isValidQuietTime('07:30')).toBe(true);
  });

  it('geçersiz biçimleri reddeder', () => {
    expect(isValidQuietTime('24:00')).toBe(false);
    expect(isValidQuietTime('23:60')).toBe(false);
    expect(isValidQuietTime('7:30')).toBe(false);
    expect(isValidQuietTime('07:30:00')).toBe(false);
    expect(isValidQuietTime('bozuk')).toBe(false);
  });
});

describe('hasQuietWindow', () => {
  it('üçü de dolu ise pencere var', () => {
    expect(
      hasQuietWindow({ quietFrom: '23:00', quietTo: '07:00', quietTimezone: 'Europe/Istanbul' }),
    ).toBe(true);
  });

  it('herhangi biri null ise pencere yok', () => {
    expect(
      hasQuietWindow({ quietFrom: '23:00', quietTo: '07:00', quietTimezone: null }),
    ).toBe(false);
    expect(hasQuietWindow({ quietFrom: null, quietTo: null, quietTimezone: null })).toBe(false);
  });
});

describe('resolveQuietHours', () => {
  it('kapalı taslakta üçlü null döner', () => {
    const result = resolveQuietHours({
      enabled: false,
      from: '23:00',
      to: '07:00',
      timezone: QUIET_HOURS_DEFAULT_TIMEZONE,
    });
    expect(result).toEqual({
      ok: true,
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
    });
  });

  it('geçerli açık taslağı üçlüye çevirir', () => {
    const result = resolveQuietHours({
      enabled: true,
      from: '22:00',
      to: '08:00',
      timezone: 'Europe/Istanbul',
    });
    expect(result).toEqual({
      ok: true,
      quietFrom: '22:00',
      quietTo: '08:00',
      quietTimezone: 'Europe/Istanbul',
    });
  });

  it('geçersiz saat hata döndürür', () => {
    const result = resolveQuietHours({
      enabled: true,
      from: '25:00',
      to: '08:00',
      timezone: QUIET_HOURS_DEFAULT_TIMEZONE,
    });
    expect(result).toEqual({ ok: false, error: 'invalidTime' });
  });

  it('başlangıç ve bitiş aynıysa hata döndürür', () => {
    const result = resolveQuietHours({
      enabled: true,
      from: '22:00',
      to: '22:00',
      timezone: QUIET_HOURS_DEFAULT_TIMEZONE,
    });
    expect(result).toEqual({ ok: false, error: 'invalidWindow' });
  });
});
