/**
 * Bildirim cache dönüşümleri (Faz 7K) — `notifications.list` (mobil MVP tek
 * sayfa `useQuery`) ve `notifications.unreadCount` cache'lerinin saf, iyimser
 * (optimistic) güncelleyicileri.
 *
 * Web bildirim merkezi `useInfiniteQuery` kullanır; mobil MVP ilk 25'i tek
 * `useQuery` ile çeker (7I arama deseni). Bu yüzden burada `InfiniteData`
 * değil, düz `{ items, nextCursor }` sayfa şekli güncellenir.
 *
 * Saf modül — RN/Expo/TanStack importu yok; `board-cache.ts` deseni gibi
 * birim test edilir.
 */

/** `notifications.list` çıktısının cache'te tutulan tek-sayfa şekli. */
export type NotificationListPage<T extends NotificationLike> = {
  items: T[];
  nextCursor: string | null;
};

/** Cache dönüşümlerinin dokunduğu minimum bildirim alanları. */
export type NotificationLike = {
  id: string;
  readAt: Date | null;
};

/** `notifications.unreadCount` çıktısının cache şekli. */
export type UnreadCountData = { count: number };

/**
 * Tek bir bildirimi (id) iyimser olarak okundu işaretler. Satır bulunamazsa
 * ya da zaten okunmuşsa sayfa referansı korunur (gereksiz re-render yok).
 */
export function markNotificationRead<T extends NotificationLike>(
  page: NotificationListPage<T> | undefined,
  id: string,
  readAt: Date,
): NotificationListPage<T> | undefined {
  if (!page) return page;
  let changed = false;
  const items = page.items.map((item) => {
    if (item.id === id && item.readAt == null) {
      changed = true;
      return { ...item, readAt };
    }
    return item;
  });
  return changed ? { ...page, items } : page;
}

/** Tüm okunmamış bildirimleri iyimser olarak okundu işaretler. */
export function markAllNotificationsRead<T extends NotificationLike>(
  page: NotificationListPage<T> | undefined,
  readAt: Date,
): NotificationListPage<T> | undefined {
  if (!page) return page;
  let changed = false;
  const items = page.items.map((item) => {
    if (item.readAt == null) {
      changed = true;
      return { ...item, readAt };
    }
    return item;
  });
  return changed ? { ...page, items } : page;
}

/**
 * Okunmamış sayacını bir azaltır (negatife düşmez). Cache yoksa olduğu gibi
 * bırakılır — sayaç sorgusu henüz çekilmemiş olabilir.
 */
export function decrementUnreadCount(
  data: UnreadCountData | undefined,
): UnreadCountData | undefined {
  if (!data) return data;
  return { count: Math.max(0, data.count - 1) };
}

/**
 * Okunmamış sayacını bir artırır. Optimistic `decrementUnreadCount`'u geri
 * almak için kullanılır: server bildirimin zaten okunmuş olduğunu
 * (`changed: false`) bildirdiğinde gereksiz düşürülen sayaç telafi edilir.
 * Cache yoksa olduğu gibi bırakılır.
 */
export function incrementUnreadCount(
  data: UnreadCountData | undefined,
): UnreadCountData | undefined {
  if (!data) return data;
  return { count: data.count + 1 };
}

/** Okunmamış sayacını sıfırlar ("tümünü okundu" sonrası). */
export function resetUnreadCount(
  data: UnreadCountData | undefined,
): UnreadCountData | undefined {
  if (!data) return data;
  return { count: 0 };
}

/** Bir bildirimin (henüz) okunmamış olup olmadığını söyler. */
export function isUnread(notification: NotificationLike): boolean {
  return notification.readAt == null;
}
