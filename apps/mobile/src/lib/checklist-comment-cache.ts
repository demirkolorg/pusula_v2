import type { QueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import type { useTRPC } from '@/trpc/provider';

type Checklists = RouterOutputs['checklist']['list'];
type TRPC = ReturnType<typeof useTRPC>;

/**
 * `checklist.list` çıktısında `checklistItemId`'li maddenin `commentCount`'unu
 * `delta` kadar değiştirilmiş YENİ bir liste döndürür (saf fonksiyon — girişi
 * mutate etmez). Sayı `Math.max(0, …)` ile negatife düşmez. Madde hiçbir
 * listede yoksa ya da delta sıfır etki ediyorsa **aynı referansı** döndürür
 * (çağıran `next === lists` ile değişiklik olmadığını anlar; gereksiz cache
 * yazımı / re-render olmaz). Yalnız ilgili liste ve madde yeni nesne olur;
 * geri kalanı referansla korunur.
 */
export function applyCommentCountDelta(
  lists: Checklists,
  checklistItemId: string,
  delta: number,
): Checklists {
  let changed = false;
  const next = lists.map((list) => {
    if (!list.items.some((item) => item.id === checklistItemId)) return list;
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== checklistItemId) return item;
        const nextCount = Math.max(0, item.commentCount + delta);
        if (nextCount === item.commentCount) return item;
        changed = true;
        return { ...item, commentCount: nextCount };
      }),
    };
  });
  return changed ? next : lists;
}

/**
 * Bir kontrol listesi maddesinin `commentCount`'unu `checklist.list({ cardId })`
 * cache'inde `delta` kadar optimistic yamalar (madde yorumu eklenince +1,
 * silinince -1) ve **rollback fonksiyonu** döndürür: çağrılırsa cache eski
 * sayıya geri döner. Cache yoksa ya da etki yoksa no-op rollback döner.
 *
 * Madde yorum composer (ekleme) ve list (silme) bunu paylaşır; gerçek sayı her
 * durumda `onSettled` invalidate ile sunucudan tazelenir. Saf dönüşüm
 * {@link applyCommentCountDelta}'da (birim test edilir).
 */
export function bumpChecklistItemCommentCount(
  queryClient: QueryClient,
  trpc: TRPC,
  cardId: string,
  checklistItemId: string,
  delta: number,
): () => void {
  const key = trpc.checklist.list.queryKey({ cardId });
  const prev = queryClient.getQueryData<Checklists>(key);
  if (!prev) return () => {};

  const next = applyCommentCountDelta(prev, checklistItemId, delta);
  if (next === prev) return () => {};

  queryClient.setQueryData<Checklists>(key, next);
  // Rollback: yamadan önceki snapshot'ı geri koy.
  return () => {
    queryClient.setQueryData<Checklists>(key, prev);
  };
}
