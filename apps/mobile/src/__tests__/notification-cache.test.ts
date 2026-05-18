import { describe, expect, it } from 'vitest';
import {
  decrementUnreadCount,
  incrementUnreadCount,
  isUnread,
  markAllNotificationsRead,
  markNotificationRead,
  resetUnreadCount,
  type NotificationListPage,
} from '@/lib/notification-cache';

/**
 * `notification-cache.ts` birim testleri (Faz 7K) — bildirim merkezi
 * optimistic cache dönüşümleri.
 */
type Row = { id: string; readAt: Date | null };

const READ_AT = new Date('2026-05-18T10:00:00Z');

function page(items: Row[]): NotificationListPage<Row> {
  return { items, nextCursor: null };
}

describe('markNotificationRead', () => {
  it('hedef okunmamış satırı okundu işaretler', () => {
    const before = page([
      { id: 'n1', readAt: null },
      { id: 'n2', readAt: null },
    ]);
    const after = markNotificationRead(before, 'n1', READ_AT);
    expect(after?.items[0]).toEqual({ id: 'n1', readAt: READ_AT });
    expect(after?.items[1]).toEqual({ id: 'n2', readAt: null });
  });

  it('zaten okunmuş satıra dokunmaz, aynı sayfa referansını döndürür', () => {
    const before = page([{ id: 'n1', readAt: READ_AT }]);
    const after = markNotificationRead(before, 'n1', new Date());
    expect(after).toBe(before);
  });

  it('bulunmayan id için sayfayı değiştirmez', () => {
    const before = page([{ id: 'n1', readAt: null }]);
    expect(markNotificationRead(before, 'yok', READ_AT)).toBe(before);
  });

  it('cache yoksa undefined döndürür', () => {
    expect(markNotificationRead(undefined, 'n1', READ_AT)).toBeUndefined();
  });
});

describe('markAllNotificationsRead', () => {
  it('tüm okunmamış satırları okundu işaretler', () => {
    const before = page([
      { id: 'n1', readAt: null },
      { id: 'n2', readAt: READ_AT },
      { id: 'n3', readAt: null },
    ]);
    const after = markAllNotificationsRead(before, READ_AT);
    expect(after?.items.every((item) => item.readAt !== null)).toBe(true);
  });

  it('hepsi okunmuşsa aynı sayfa referansını döndürür', () => {
    const before = page([{ id: 'n1', readAt: READ_AT }]);
    expect(markAllNotificationsRead(before, new Date())).toBe(before);
  });
});

describe('unread sayaç dönüşümleri', () => {
  it('decrement sayacı bir azaltır', () => {
    expect(decrementUnreadCount({ count: 3 })).toEqual({ count: 2 });
  });

  it('decrement negatife düşmez', () => {
    expect(decrementUnreadCount({ count: 0 })).toEqual({ count: 0 });
  });

  it('decrement cache yoksa undefined döndürür', () => {
    expect(decrementUnreadCount(undefined)).toBeUndefined();
  });

  it('increment sayacı bir artırır', () => {
    expect(incrementUnreadCount({ count: 2 })).toEqual({ count: 3 });
  });

  it('increment cache yoksa undefined döndürür', () => {
    expect(incrementUnreadCount(undefined)).toBeUndefined();
  });

  it('decrement sonrası increment sayacı geri getirir (markRead changed:false telafisi)', () => {
    // Optimistic markRead koşulsuz düşürür; server `changed: false` derse
    // increment ile telafi edilir → net etki sıfır.
    const start = { count: 5 };
    const afterOptimistic = decrementUnreadCount(start);
    expect(afterOptimistic).toEqual({ count: 4 });
    const afterCompensation = incrementUnreadCount(afterOptimistic);
    expect(afterCompensation).toEqual({ count: 5 });
  });

  it('reset sayacı sıfırlar', () => {
    expect(resetUnreadCount({ count: 9 })).toEqual({ count: 0 });
  });
});

describe('isUnread', () => {
  it('readAt null ise okunmamış', () => {
    expect(isUnread({ id: 'n1', readAt: null })).toBe(true);
  });

  it('readAt dolu ise okunmuş', () => {
    expect(isUnread({ id: 'n1', readAt: READ_AT })).toBe(false);
  });
});
