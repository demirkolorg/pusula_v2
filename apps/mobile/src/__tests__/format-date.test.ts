import { describe, expect, it } from 'vitest';
import {
  dueDateTone,
  formatDueDate,
  formatDueDateSmart,
  formatRelativeTime,
  isOverdue,
} from '../lib/format-date';
import { labelColorHex } from '../lib/label-color';

/** Faz 7E — kart yüzü saf helper birim testleri. */
describe('formatDueDate', () => {
  it('kısa Türkçe tarih döndürür', () => {
    expect(formatDueDate(new Date(2026, 4, 12))).toBe('12 May');
    expect(formatDueDate(new Date(2026, 0, 1))).toBe('1 Oca');
    expect(formatDueDate(new Date(2026, 11, 31))).toBe('31 Ara');
  });

  it('ISO string kabul eder', () => {
    expect(formatDueDate('2026-03-09T10:00:00.000Z')).toMatch(/Mar$/);
  });

  it('geçersiz tarihte boş string döndürür', () => {
    expect(formatDueDate('geçersiz')).toBe('');
  });
});

describe('formatDueDateSmart', () => {
  const now = new Date(2026, 4, 12, 15, 0); // 12 May 2026, 15:00

  it('yakın günleri göreli gösterir', () => {
    expect(formatDueDateSmart(new Date(2026, 4, 12, 9, 0), now)).toBe('Bugün');
    expect(formatDueDateSmart(new Date(2026, 4, 13), now)).toBe('Yarın');
    expect(formatDueDateSmart(new Date(2026, 4, 11), now)).toBe('Dün');
    expect(formatDueDateSmart(new Date(2026, 4, 15), now)).toBe('3 gün sonra');
    expect(formatDueDateSmart(new Date(2026, 4, 10), now)).toBe('2 gün gecikti');
  });

  it('uzak tarihte kısa tarihe düşer; farklı yıl yılı ekler', () => {
    expect(formatDueDateSmart(new Date(2026, 5, 20), now)).toBe('20 Haz');
    expect(formatDueDateSmart(new Date(2027, 4, 12), now)).toBe('12 May 2027');
  });

  it('geçersiz tarihte boş string', () => {
    expect(formatDueDateSmart('geçersiz', now)).toBe('');
  });
});

describe('dueDateTone', () => {
  const now = new Date(2026, 4, 12, 15, 0);

  it('geçmiş → overdue, bugün-ileride/yarın → soon, uzak → normal', () => {
    expect(dueDateTone(new Date(2026, 4, 12, 10, 0), now)).toBe('overdue'); // bugün ama saat geçmiş
    expect(dueDateTone(new Date(2026, 4, 11), now)).toBe('overdue'); // dün
    expect(dueDateTone(new Date(2026, 4, 12, 20, 0), now)).toBe('soon'); // bugün ileride
    expect(dueDateTone(new Date(2026, 4, 13), now)).toBe('soon'); // yarın
    expect(dueDateTone(new Date(2026, 4, 20), now)).toBe('normal'); // uzak
  });
});

describe('isOverdue', () => {
  it('geçmiş tarih → true, gelecek → false', () => {
    expect(isOverdue(new Date(Date.now() - 60_000))).toBe(true);
    expect(isOverdue(new Date(Date.now() + 60_000))).toBe(false);
  });

  it('geçersiz tarih → false', () => {
    expect(isOverdue('geçersiz')).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-18T12:00:00');

  it('45 saniyeden yakın geçmiş → "az önce"', () => {
    expect(formatRelativeTime(new Date('2026-05-18T11:59:30'), now)).toBe('az önce');
  });

  it('dakika/saat/gün dilimlerini doğru biçimler', () => {
    expect(formatRelativeTime(new Date('2026-05-18T11:50:00'), now)).toBe('10 dk önce');
    expect(formatRelativeTime(new Date('2026-05-18T09:00:00'), now)).toBe('3 sa önce');
    expect(formatRelativeTime(new Date('2026-05-15T12:00:00'), now)).toBe('3 gün önce');
  });

  it('ay ve yıl dilimlerini biçimler', () => {
    expect(formatRelativeTime(new Date('2026-03-18T12:00:00'), now)).toBe('2 ay önce');
    expect(formatRelativeTime(new Date('2024-05-18T12:00:00'), now)).toBe('2 yıl önce');
  });

  it('gelecek tarih → "az önce" (saat kayması toleransı)', () => {
    expect(formatRelativeTime(new Date('2026-05-18T12:05:00'), now)).toBe('az önce');
  });

  it('geçersiz tarih → boş string', () => {
    expect(formatRelativeTime('bozuk', now)).toBe('');
  });
});

describe('labelColorHex', () => {
  it('bilinen anahtarı hex değere çevirir', () => {
    expect(labelColorHex('green')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(labelColorHex('red')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('bilinmeyen anahtar → nötr gri fallback', () => {
    expect(labelColorHex('bilinmeyen')).toBe('#8c8f97');
  });
});
