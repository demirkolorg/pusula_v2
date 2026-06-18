/**
 * Kontrol listesi maddelerini sürükle-bırakla yeniden sıralama saf yardımcıları
 * (web — Pragmatic Drag and Drop). UI/gesture'dan bağımsız, test edilebilir:
 * yalnızca id dizileri + pozisyonlar üzerinde çalışır, böylece DnD/animasyon
 * mantığı bileşenlerde, sıra/komşu/pozisyon hesabı burada kalır. Mobil
 * `apps/mobile/src/lib/checklist-reorder.ts` ile aynı saf çekirdek (moveId,
 * neighboursForReorder, applyOrder); web ayrıca drop target id + edge'den tam
 * plan (`planChecklistReorder`) hesaplar — `board-dnd-position.ts` ile aynı
 * "edge → drop index → komşular → newPosition" yaklaşımı, tek checklist içinde.
 *
 * `OPTIMISTIC_PREFIX` ile başlayan id'ler henüz sunucuda olmayan (optimistic)
 * maddelerdir; bunlar `reorder` mutation'ında komşu olarak KULLANILMAZ — backend
 * `beforeItemId`/`afterItemId`'yi gerçek (kalıcı) maddelere göre çözer
 * (`positionBetween`). Bu yüzden komşu hesabı optimistic id'leri atlar.
 */
import { comparePosition, positionBetween } from '@pusula/domain';

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

  let beforeItemId: string | undefined;
  for (let i = index - 1; i >= 0; i -= 1) {
    const id = orderedIds[i];
    if (id && !isOptimisticItemId(id)) {
      beforeItemId = id;
      break;
    }
  }

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

/** Drop hedefinin en yakın dikey kenarı (madde listesi dikey). */
export type ChecklistItemEdge = 'top' | 'bottom';

type ChecklistItemPosition = { id: string; position: string };

/**
 * Bir checklist maddesinin sürükle-bırak ile yeniden sıralanma planı: taşıma
 * sonrası tam görsel sıra (`orderedIds`, optimistic cache patch'i için), backend
 * için gerçek komşu id'leri ve görsel anında uygulanacak `newPosition`
 * (LexoRank-benzeri fractional). `null` = no-op (madde zaten o konumda / hedef
 * ya da taşınan bulunamadı / hedef kendisi).
 */
export type ChecklistReorderPlan = {
  orderedIds: string[];
  beforeItemId: string | undefined;
  afterItemId: string | undefined;
  newPosition: string;
};

/**
 * Tek bir checklist içinde madde sıralama planını hesaplar (saf). `items`
 * cache'teki maddeler (rastgele sıralı olabilir) — önce `position` ile sıralanır,
 * sonra taşınan madde çıkarılıp hedefin `edge`'ine göre yerleştirilir. Komşular
 * `neighboursForReorder` ile gerçek (optimistic olmayan) maddelerden seçilir;
 * `newPosition` o komşulardan `positionBetween` ile türetilir. No-op (sonuç
 * sıra mevcut sırayla aynıysa) `null` döner — drag sırasında değil, yalnız drop
 * sonrası bir kez çağrılır.
 */
export function planChecklistReorder(args: {
  items: readonly ChecklistItemPosition[];
  movedItemId: string;
  targetItemId: string;
  edge: ChecklistItemEdge;
}): ChecklistReorderPlan | null {
  const { items, movedItemId, targetItemId, edge } = args;
  if (movedItemId === targetItemId) return null;

  const sorted = [...items].sort((a, b) => comparePosition(a.position, b.position));
  const currentIds = sorted.map((i) => i.id);
  const fromIndex = currentIds.indexOf(movedItemId);
  if (fromIndex === -1) return null;
  if (!currentIds.includes(targetItemId)) return null;

  // Taşınan madde çıkarıldıktan SONRAki hedef indeksini bul, kenara göre kaydır.
  const withoutMoved = currentIds.filter((id) => id !== movedItemId);
  const targetIndex = withoutMoved.indexOf(targetItemId);
  if (targetIndex === -1) return null;
  const insertIndex = edge === 'top' ? targetIndex : targetIndex + 1;

  const orderedIds = [...withoutMoved];
  orderedIds.splice(insertIndex, 0, movedItemId);

  // No-op: yeni sıra mevcut sırayla aynı.
  if (orderedIds.length === currentIds.length && orderedIds.every((id, i) => id === currentIds[i])) {
    return null;
  }

  const { beforeItemId, afterItemId } = neighboursForReorder(orderedIds, movedItemId);
  const posOf = (id: string | undefined): string | null =>
    id == null ? null : (sorted.find((i) => i.id === id)?.position ?? null);
  const newPosition = positionBetween(posOf(beforeItemId), posOf(afterItemId));

  return { orderedIds, beforeItemId, afterItemId, newPosition };
}
