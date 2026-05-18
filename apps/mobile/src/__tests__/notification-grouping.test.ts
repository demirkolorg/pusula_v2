import { describe, expect, it } from 'vitest';
import { groupNotificationsByDate } from '@/lib/notification-grouping';

/**
 * `notification-grouping.ts` birim testleri (Faz 7K) — bildirim tarih
 * gruplaması.
 */
const NOW = new Date('2026-05-18T12:00:00');

function at(iso: string): { id: string; createdAt: Date } {
  return { id: iso, createdAt: new Date(iso) };
}

describe('groupNotificationsByDate', () => {
  it('bildirimleri Bugün/Dün/Bu hafta/Daha eski dilimlerine böler', () => {
    const items = [
      at('2026-05-18T09:00:00'), // bugün
      at('2026-05-17T20:00:00'), // dün
      at('2026-05-13T08:00:00'), // bu hafta (5 gün önce)
      at('2026-05-01T08:00:00'), // daha eski
    ];
    const groups = groupNotificationsByDate(items, NOW);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'thisWeek', 'earlier']);
  });

  it('boş grupları eler', () => {
    const groups = groupNotificationsByDate([at('2026-05-18T08:00:00')], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('today');
  });

  it('grup içi sırayı korur', () => {
    const items = [at('2026-05-18T11:00:00'), at('2026-05-18T09:00:00')];
    const groups = groupNotificationsByDate(items, NOW);
    expect(groups[0]?.items.map((i) => i.id)).toEqual([
      '2026-05-18T11:00:00',
      '2026-05-18T09:00:00',
    ]);
  });

  it('geçersiz tarih "earlier" grubuna düşer', () => {
    const groups = groupNotificationsByDate([{ id: 'x', createdAt: 'bozuk' }], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('earlier');
  });

  it('boş liste için boş dizi döndürür', () => {
    expect(groupNotificationsByDate([], NOW)).toEqual([]);
  });

  it('tam 7 gün önce "bu hafta", 8 gün önce "daha eski"', () => {
    const sevenDays = groupNotificationsByDate([at('2026-05-11T12:00:00')], NOW);
    expect(sevenDays[0]?.key).toBe('thisWeek');
    const eightDays = groupNotificationsByDate([at('2026-05-10T12:00:00')], NOW);
    expect(eightDays[0]?.key).toBe('earlier');
  });
});
