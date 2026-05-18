/**
 * Faz 7H — `board.get` cache'i için saf (yan etkisiz) iyimser dönüşümler.
 *
 * Collaborative mutation'lar (kart/liste oluştur, liste yeniden adlandır/arşivle,
 * kart taşı) TanStack Query optimistic akışında çalışır: `onMutate` ilgili
 * `board.get` cache'ini bu fonksiyonlarla iyimser günceller, `onError` snapshot'a
 * geri sarar, `onSettled` invalidate eder. Fonksiyonlar saf olduğundan birim
 * test edilir (`__tests__/board-cache.test.ts`).
 *
 * Pozisyon `@pusula/domain` `positionBetween`/`firstPosition` ile hesaplanır —
 * tamsayı `order` yok (CLAUDE.md §2.4). İyimser pozisyon listenin/kolonun
 * sonuna eklenir; server kesin `position`'ı `onSettled` refetch'inde reconcile
 * eder.
 */
import type { RouterOutputs } from '@pusula/api';
import { firstPosition, positionBetween } from '@pusula/domain';

export type BoardData = RouterOutputs['board']['get'];
export type BoardCard = BoardData['cards'][number];
export type BoardList = BoardData['lists'][number];

/** `card.create` / `card.moveToList` ham kart satırı (cardCols — aggregate yok). */
type RawCard = RouterOutputs['card']['create'];
/** `list.create` ham liste satırı (listCols). */
type RawList = RouterOutputs['list']['create'];

/** Verilen listedeki en yüksek kart pozisyonu (yoksa `null`). */
function lastCardPosition(cards: readonly BoardCard[], listId: string): string | null {
  let max: string | null = null;
  for (const card of cards) {
    if (card.listId !== listId) continue;
    if (max === null || card.position > max) max = card.position;
  }
  return max;
}

/** Bir listenin sonuna eklenecek kart pozisyonu. */
function appendCardPosition(cards: readonly BoardCard[], listId: string): string {
  const last = lastCardPosition(cards, listId);
  return last === null ? firstPosition() : positionBetween(last, null);
}

/** Board'daki tüm listeler arasında sona eklenecek liste pozisyonu. */
function appendListPosition(lists: readonly BoardList[]): string {
  let max: string | null = null;
  for (const list of lists) {
    if (max === null || list.position > max) max = list.position;
  }
  return max === null ? firstPosition() : positionBetween(max, null);
}

/** Ham kart satırını (aggregate'siz) board kartı şekline tamamlar. */
function toBoardCard(raw: RawCard): BoardCard {
  return {
    ...raw,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    members: [],
    coverImage: null,
  };
}

/**
 * İyimser kart ekler — `card.create` sunucudan dönmeden önce, geçici `tempId`
 * ile listenin sonuna. `card.create` dönünce {@link replaceOptimisticCard} ile
 * gerçeklenir.
 */
export function addOptimisticCard(
  data: BoardData,
  args: { listId: string; tempId: string; title: string },
): BoardData {
  const now = new Date();
  const card: BoardCard = {
    id: args.tempId,
    listId: args.listId,
    boardId: data.board.id,
    title: args.title,
    description: null,
    position: appendCardPosition(data.cards, args.listId),
    dueAt: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    coverImageAttachmentId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    members: [],
    coverImage: null,
  };
  return { ...data, cards: [...data.cards, card] };
}

/** Geçici (optimistic) kartı `card.create` dönüşündeki gerçek kartla değiştirir. */
export function replaceOptimisticCard(
  data: BoardData,
  tempId: string,
  real: RawCard,
): BoardData {
  return {
    ...data,
    cards: data.cards.map((card) => (card.id === tempId ? toBoardCard(real) : card)),
  };
}

/** İyimser liste ekler — board şeridinin sonuna, geçici `tempId` ile. */
export function addOptimisticList(
  data: BoardData,
  args: { tempId: string; title: string },
): BoardData {
  const now = new Date();
  const list: BoardList = {
    id: args.tempId,
    title: args.title,
    color: null,
    icon: null,
    iconColor: null,
    position: appendListPosition(data.lists),
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, lists: [...data.lists, list] };
}

/** Geçici (optimistic) listeyi `list.create` dönüşündeki gerçek listeyle değiştirir. */
export function replaceOptimisticList(
  data: BoardData,
  tempId: string,
  real: RawList,
): BoardData {
  const next: BoardList = {
    id: real.id,
    title: real.title,
    color: real.color,
    icon: real.icon,
    iconColor: real.iconColor,
    position: real.position,
    archivedAt: real.archivedAt,
    createdAt: real.createdAt,
    updatedAt: real.updatedAt,
  };
  return {
    ...data,
    lists: data.lists.map((list) => (list.id === tempId ? next : list)),
  };
}

/** Bir listenin başlığını iyimser değiştirir. */
export function renameListInCache(data: BoardData, listId: string, title: string): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) => (list.id === listId ? { ...list, title } : list)),
  };
}

/** Bir kartın başlığını iyimser değiştirir (kart detayından düzenleme). */
export function renameCardInCache(data: BoardData, cardId: string, title: string): BoardData {
  return {
    ...data,
    cards: data.cards.map((card) => (card.id === cardId ? { ...card, title } : card)),
  };
}

/**
 * Bir listeyi iyimser arşivler — `archivedAt` set edilir; board ekranı arşivli
 * listeleri filtrelediği için liste görünümden düşer.
 */
export function archiveListInCache(data: BoardData, listId: string): BoardData {
  return {
    ...data,
    lists: data.lists.map((list) =>
      list.id === listId ? { ...list, archivedAt: new Date() } : list,
    ),
  };
}

/**
 * Bir kartı iyimser olarak hedef listenin sonuna taşır. Kart diziden çıkarılıp
 * yeni `listId` + sona-ekleme pozisyonuyla tekrar eklenir — böylece hedef
 * kolonun `position` sıralı filtresinde en sonda görünür.
 */
export function moveCardInCache(data: BoardData, cardId: string, toListId: string): BoardData {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) return data;
  const rest = data.cards.filter((item) => item.id !== cardId);
  const moved: BoardCard = {
    ...card,
    listId: toListId,
    position: appendCardPosition(rest, toListId),
  };
  return { ...data, cards: [...rest, moved] };
}

/**
 * Bir kartın kapak görselini iyimser değiştirir (Faz 7P — `card.update`
 * `coverImageAttachmentId`). `coverImage` `null` ise kapak kaldırılır. Hem
 * `coverImage` (kart yüzü şeridi) hem `coverImageAttachmentId` (ham alan)
 * birlikte güncellenir — kullanıcı board'a döndüğünde kart yüzü tutarlı olsun.
 */
export function setCardCoverImageInCache(
  data: BoardData,
  cardId: string,
  coverImage: BoardCard['coverImage'],
): BoardData {
  return {
    ...data,
    cards: data.cards.map((card) =>
      card.id === cardId
        ? { ...card, coverImage, coverImageAttachmentId: coverImage?.attachmentId ?? null }
        : card,
    ),
  };
}
