/**
 * Bildirimleri tarih-göreli gruplara böler (Faz 7K) — bildirim merkezi
 * "Bugün / Dün / Bu hafta / Daha eski" başlıkları. Web
 * `notification-types.ts` `groupNotificationsByDate` deseninin mobil
 * karşılığı.
 *
 * Saf modül — RN/Expo importu yok; birim test edilir.
 */

/** Tarih grubu anahtarı — sabit gösterim sırası `GROUP_ORDER`'da. */
export type NotificationGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

/** Tek grup — bir tarih dilimi ve o dilimdeki bildirimler. */
export type NotificationGroup<T> = {
  key: NotificationGroupKey;
  items: T[];
};

/** Cache dönüşümlerinin dokunduğu minimum alan — gruplama için `createdAt`. */
type DatedNotification = { createdAt: Date | string };

const GROUP_ORDER: readonly NotificationGroupKey[] = [
  'today',
  'yesterday',
  'thisWeek',
  'earlier',
];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Bir bildirimin oluşturulma tarihini grup anahtarına eşler. */
function classifyByDate(createdAt: Date | string, now: Date): NotificationGroupKey {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'earlier';

  const today = startOfDay(now);
  const created = startOfDay(date);
  const diffDays = Math.round((today.getTime() - created.getTime()) / 86_400_000);

  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  // `thisWeek` = son 7 gün (takvim haftası değil) — web `classifyByDate` paritesi.
  if (diffDays <= 7) return 'thisWeek';
  return 'earlier';
}

/**
 * Bildirimleri tarih-göreli gruplara böler; gelen sıra grup içinde korunur,
 * boş gruplar elenir. Gruplar `GROUP_ORDER`'a göre döner.
 */
export function groupNotificationsByDate<T extends DatedNotification>(
  items: readonly T[],
  now: Date = new Date(),
): NotificationGroup<T>[] {
  const buckets = new Map<NotificationGroupKey, T[]>();
  for (const item of items) {
    const key = classifyByDate(item.createdAt, now);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return GROUP_ORDER.flatMap((key) => {
    const bucketItems = buckets.get(key);
    return bucketItems && bucketItems.length > 0 ? [{ key, items: bucketItems }] : [];
  });
}
