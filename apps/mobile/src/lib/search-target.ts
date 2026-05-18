/**
 * Arama sonucu → mobil navigasyon eşlemesi (Faz 7I).
 *
 * `search.query` (Faz 6.5) sonuçları `targetUrl` alanını **web** rota deseninde
 * (`/workspaces/.../boards/...?card=...`) döndürür — mobil Expo Router rotaları
 * farklı olduğundan bu alan mobilde kullanılmaz. Hedef bunun yerine `entityType`
 * + `boardId`/`cardId`/`workspaceId` alanlarından deterministik türetilir.
 *
 * Saf modül — RN/Expo importu yok; `search-target.test.ts` ile birim test edilir.
 */
import type { SearchResult } from '@pusula/domain';

type SearchEntityType = SearchResult['entityType'];

/**
 * Sonuç gruplamada entity tiplerinin gösterim sırası — web arama diyaloğu
 * (`apps/web` §8.1.12) ile aynı: pano → liste → kart → yorum → ek → etiket.
 *
 * `satisfies Record<SearchEntityType, …>` — domain'e yeni bir entity tipi
 * eklenirse bu nesne eksik kalırsa derleme hatası verir (sessizce elenmez).
 */
const ENTITY_DISPLAY_ORDER = {
  board: 0,
  list: 1,
  card: 2,
  comment: 3,
  attachment: 4,
  label: 5,
} satisfies Record<SearchEntityType, number>;

/** Kart detayına giden entity tipleri (kendi kartı ya da bağlı kart). */
const CARD_SCOPED_TYPES: readonly SearchEntityType[] = ['card', 'comment', 'attachment'];

/** Expo Router hedefi — `searchResultTarget` üç mobil rotadan birini döndürür. */
export type SearchTarget =
  | { pathname: '/cards/[cardId]'; params: { cardId: string; title: string } }
  | { pathname: '/boards/[boardId]'; params: { boardId: string; title: string } }
  | { pathname: '/workspaces/[id]'; params: { id: string; name: string } };

/** `searchResultTarget` girişi — `SearchResult`'ın navigasyon için gereken alt kümesi. */
export type SearchTargetInput = Pick<
  SearchResult,
  | 'entityType'
  | 'entityId'
  | 'workspaceId'
  | 'workspaceTitle'
  | 'boardId'
  | 'boardTitle'
  | 'cardId'
  | 'cardTitle'
  | 'title'
>;

/** Board sonucu (board/list/label) → board ekranı; board yoksa workspace ekranı. */
function boardTarget(result: SearchTargetInput): SearchTarget {
  if (result.boardId) {
    return {
      pathname: '/boards/[boardId]',
      params: { boardId: result.boardId, title: result.boardTitle ?? result.title },
    };
  }
  return {
    pathname: '/workspaces/[id]',
    params: { id: result.workspaceId, name: result.workspaceTitle },
  };
}

/**
 * Bir arama sonucunu açılacak mobil rotaya çevirir.
 *
 * - `card` → kart detayı (`entityId` kartın kendi kimliği).
 * - `comment` / `attachment` → bağlı kartın detayı (`cardId`); kart kimliği
 *   yoksa board ekranına düşülür.
 * - `board` / `list` / `label` → board ekranı; `boardId` yoksa workspace ekranı.
 *
 * Hedef türetilemezse `null` döner (çağıran navigasyon yapmaz).
 */
export function searchResultTarget(result: SearchTargetInput): SearchTarget | null {
  if (CARD_SCOPED_TYPES.includes(result.entityType)) {
    const cardId = result.entityType === 'card' ? result.entityId : (result.cardId ?? null);
    if (!cardId) return boardTarget(result);
    const title = result.entityType === 'card' ? result.title : (result.cardTitle ?? '');
    return { pathname: '/cards/[cardId]', params: { cardId, title } };
  }
  if (result.entityType === 'board' || result.entityType === 'list' || result.entityType === 'label') {
    return boardTarget(result);
  }
  return null;
}

/** Tek grup — bir entity tipi ve o tipteki sonuçlar. */
export type SearchResultGroup<T> = { entityType: SearchEntityType; items: T[] };

/**
 * Sonuçları entity tipine göre gruplar; gösterim sırasını korur, boş grupları
 * eler. Grup içi sıralama API'den geldiği gibi (rank DESC) bırakılır.
 */
export function groupSearchResults<T extends { entityType: SearchEntityType }>(
  items: readonly T[],
): SearchResultGroup<T>[] {
  return (Object.keys(ENTITY_DISPLAY_ORDER) as SearchEntityType[])
    .map((entityType) => ({
      entityType,
      items: items.filter((item) => item.entityType === entityType),
    }))
    .filter((group) => group.items.length > 0);
}
