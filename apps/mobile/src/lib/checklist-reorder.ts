/**
 * Kontrol listesi maddelerini sürükle-bırakla yeniden sıralama saf yardımcıları
 * (DEM — manuel reanimated sortable). UI/gesture'dan bağımsız, test edilebilir:
 * yalnızca id dizileri üzerinde çalışır, böylece offset/animasyon mantığı
 * `sortable-checklist-items.tsx`'te, sıra hesabı burada kalır.
 *
 * `OPTIMISTIC_PREFIX` ile başlayan id'ler henüz sunucuda olmayan (optimistic)
 * maddelerdir; bunlar `reorder` mutation'ında komşu olarak KULLANILMAZ — backend
 * `beforeItemId`/`afterItemId`'yi gerçek (kalıcı) maddelere göre çözer
 * (`positionBetween`). Bu yüzden komşu hesabı optimistic id'leri atlar.
 */

/** Optimistic eklenen (henüz sunucuda olmayan) madde id ön eki. */
export const OPTIMISTIC_PREFIX = 'optimistic-';

/** Bir madde id'sinin optimistic (henüz sunucuya yazılmamış) olup olmadığı. */
export function isOptimisticItemId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/**
 * Bir maddeyi `from` indeksinden `to` indeksine taşıyan yeni id dizisi döndürür
 * (immutable — kaynağı mutate etmez). Geçersiz/no-op taşımalar girdiyi aynen
 * (yeni dizi olarak) döndürür.
 */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...ids];
  next.splice(to, 0, moved);
  return next;
}

/**
 * Taşınan maddenin YENİ sırasındaki gerçek (optimistic olmayan) komşularını
 * hesaplar — backend `reorder` input'undaki `beforeItemId`/`afterItemId`.
 *
 * `orderedIds` taşıma SONRASI tam sıralı id dizisidir (taşınan madde dahil).
 * Komşular taşınan maddeden geriye/ileriye doğru taranır; ilk gerçek (optimistic
 * olmayan) madde komşu kabul edilir. Liste başına taşımada `beforeItemId`
 * undefined, sona taşımada `afterItemId` undefined olur — backend'in
 * `positionBetween(null, after)` / `positionBetween(before, null)` sözleşmesi.
 *
 * @returns Komşu yoksa (örn. tek gerçek madde) ikisi de `undefined`.
 */
export function neighboursForReorder(
  orderedIds: readonly string[],
  movedId: string,
): { beforeItemId: string | undefined; afterItemId: string | undefined } {
  const index = orderedIds.indexOf(movedId);
  if (index === -1) return { beforeItemId: undefined, afterItemId: undefined };

  // Geriye doğru ilk gerçek (optimistic olmayan) madde → önceki komşu.
  let beforeItemId: string | undefined;
  for (let i = index - 1; i >= 0; i -= 1) {
    const id = orderedIds[i];
    if (id && !isOptimisticItemId(id)) {
      beforeItemId = id;
      break;
    }
  }

  // İleriye doğru ilk gerçek (optimistic olmayan) madde → sonraki komşu.
  let afterItemId: string | undefined;
  for (let i = index + 1; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (id && !isOptimisticItemId(id)) {
      afterItemId = id;
      break;
    }
  }

  return { beforeItemId, afterItemId };
}

/**
 * Verilen madde dizisini (her biri `id` taşıyan) `orderedIds`'teki sıraya göre
 * yeniden dizer — optimistic cache patch'i için. `orderedIds`'te olmayan
 * maddeler atlanır; `orderedIds`'te olup dizide olmayan id'ler yok sayılır.
 * Mutate etmez (yeni dizi döndürür).
 */
export function applyOrder<T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const result: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) result.push(item);
  }
  return result;
}
