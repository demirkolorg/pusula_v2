import { describe, expect, it } from 'vitest';
import { DUE_PRESET_HOUR, isSameDay, presetDate } from '../lib/due-date-presets';

/**
 * DEM-203 WP7 — son tarih hazır-ayar saf yardımcı birim testleri
 * (`DueDatePresetPicker`'tan ayrıştırılmış `lib/due-date-presets`).
 */
describe('presetDate', () => {
  // Sabit referans gün: 2026-05-18 (Pazartesi), saat 09:30 — `now`'a saatten
  // bağımsızlık doğrulaması için 09:30 verildi (preset HER ZAMAN 18:00'e gider).
  const monday = new Date(2026, 4, 18, 9, 30, 0, 0);

  it('saati her zaman DUE_PRESET_HOUR (18:00) gün-sonuna sabitler', () => {
    for (const kind of ['today', 'tomorrow', 'weekend', 'nextWeek'] as const) {
      const result = presetDate(kind, monday);
      expect(result.getHours()).toBe(DUE_PRESET_HOUR);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    }
  });

  it('"today" → aynı gün', () => {
    const result = presetDate('today', monday);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4);
    expect(result.getDate()).toBe(18);
  });

  it('"tomorrow" → ertesi gün', () => {
    expect(presetDate('tomorrow', monday).getDate()).toBe(19);
  });

  it('"nextWeek" → 7 gün sonra', () => {
    expect(presetDate('nextWeek', monday).getDate()).toBe(25);
  });

  it('"weekend" → Pazartesiden bir sonraki Cumartesi (offset 5)', () => {
    // 2026-05-18 Pazartesi (getDay() === 1) → bir sonraki Cumartesi 2026-05-23.
    const result = presetDate('weekend', monday);
    expect(result.getDate()).toBe(23);
    expect(result.getDay()).toBe(6);
  });

  it('"weekend" → Cuma günü ertesi Cumartesiyi seçer (offset 1)', () => {
    const friday = new Date(2026, 4, 22, 9, 30); // 2026-05-22 Cuma (getDay() === 5)
    const result = presetDate('weekend', friday);
    expect(result.getDate()).toBe(23);
    expect(result.getDay()).toBe(6);
  });

  it('"weekend" → bugün Cumartesiyse GELECEK Cumartesiyi seçer (offset 7, asla bugün)', () => {
    const saturday = new Date(2026, 4, 23, 9, 30); // 2026-05-23 Cumartesi (getDay() === 6)
    const result = presetDate('weekend', saturday);
    // `offset = (6 - 6 + 7) % 7 || 7` → 0 || 7 → 7 → 7 gün sonra.
    expect(result.getDate()).toBe(30);
    expect(result.getDay()).toBe(6);
  });

  it('"weekend" → Pazar günü ertesi Cumartesiyi seçer (offset 6)', () => {
    const sunday = new Date(2026, 4, 24, 9, 30); // 2026-05-24 Pazar (getDay() === 0)
    const result = presetDate('weekend', sunday);
    expect(result.getDate()).toBe(30);
    expect(result.getDay()).toBe(6);
  });

  it('ay sınırını aşan offset takvimsel olarak ilerler', () => {
    const endOfMonth = new Date(2026, 4, 28, 9, 30); // 2026-05-28 Perşembe
    const result = presetDate('nextWeek', endOfMonth);
    // 28 + 7 = 35 → Haziran 4.
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(4);
  });

  it('verilen now degerini mutate etmez (saf — yeni Date döndürür)', () => {
    const now = new Date(2026, 4, 18, 9, 30, 12, 5);
    const snapshot = now.getTime();
    presetDate('nextWeek', now);
    expect(now.getTime()).toBe(snapshot);
  });
});

describe('isSameDay', () => {
  it('aynı takvim günü → true (saat farkı önemsiz)', () => {
    const a = new Date(2026, 4, 18, 0, 0, 0);
    const b = new Date(2026, 4, 18, 23, 59, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('farklı gün → false', () => {
    expect(isSameDay(new Date(2026, 4, 18), new Date(2026, 4, 19))).toBe(false);
  });

  it('farklı ay → false', () => {
    expect(isSameDay(new Date(2026, 4, 18), new Date(2026, 5, 18))).toBe(false);
  });

  it('farklı yıl → false (aynı gün/ay)', () => {
    expect(isSameDay(new Date(2025, 4, 18), new Date(2026, 4, 18))).toBe(false);
  });
});
