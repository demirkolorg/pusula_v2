import { describe, expect, it } from 'vitest';
import {
  groupSearchResults,
  searchResultTarget,
  type SearchTargetInput,
} from '../lib/search-target';

/**
 * Faz 7I — arama sonucu → mobil navigasyon eşlemesi saf birim testleri.
 * `searchResultTarget` web `targetUrl`'ini değil entity alanlarını kullanır;
 * `groupSearchResults` entity tipine göre sabit sıralı gruplama yapar.
 */

/** Test girişi üretici — alanlar varsayılan dolu, senaryo bazında ezilir. */
function result(overrides: Partial<SearchTargetInput> & Pick<SearchTargetInput, 'entityType'>): SearchTargetInput {
  return {
    entityId: 'entity-1',
    workspaceId: 'ws-1',
    workspaceTitle: 'Çalışma Alanı',
    boardId: 'board-1',
    boardTitle: 'Pano',
    cardId: 'card-1',
    cardTitle: 'Kart',
    title: 'Sonuç',
    ...overrides,
  };
}

describe('searchResultTarget', () => {
  it('card sonucunu kendi entityId ile kart detayına yönlendirir', () => {
    expect(searchResultTarget(result({ entityType: 'card', entityId: 'card-9' }))).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'card-9', title: 'Sonuç' },
    });
  });

  it('comment sonucunu bağlı kartın detayına yönlendirir (cardTitle başlık olur)', () => {
    expect(searchResultTarget(result({ entityType: 'comment' }))).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'card-1', title: 'Kart' },
    });
  });

  it('attachment sonucunu bağlı kartın detayına yönlendirir', () => {
    expect(searchResultTarget(result({ entityType: 'attachment', cardId: 'card-3' }))).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'card-3', title: 'Kart' },
    });
  });

  it('kart kimliği olmayan yorumu board ekranına düşürür', () => {
    expect(searchResultTarget(result({ entityType: 'comment', cardId: null }))).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'board-1', title: 'Pano' },
    });
  });

  it('board sonucunu board ekranına yönlendirir (boardTitle başlık olur)', () => {
    expect(searchResultTarget(result({ entityType: 'board', title: 'Yedek ad' }))).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'board-1', title: 'Pano' },
    });
  });

  it('list ve label sonuçlarını board ekranına yönlendirir', () => {
    expect(searchResultTarget(result({ entityType: 'list' }))?.pathname).toBe('/boards/[boardId]');
    expect(searchResultTarget(result({ entityType: 'label' }))?.pathname).toBe('/boards/[boardId]');
  });

  it('boardTitle yoksa sonucun kendi başlığına düşer', () => {
    expect(
      searchResultTarget(result({ entityType: 'list', boardTitle: null, title: 'Liste adı' })),
    ).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'board-1', title: 'Liste adı' },
    });
  });

  it('board kimliği olmayan sonucu workspace ekranına düşürür', () => {
    expect(searchResultTarget(result({ entityType: 'board', boardId: null }))).toEqual({
      pathname: '/workspaces/[id]',
      params: { id: 'ws-1', name: 'Çalışma Alanı' },
    });
  });
});

describe('groupSearchResults', () => {
  it('sonuçları sabit entity sırasıyla gruplar, boş grupları eler', () => {
    const items = [
      { id: '1', entityType: 'comment' as const },
      { id: '2', entityType: 'board' as const },
      { id: '3', entityType: 'card' as const },
      { id: '4', entityType: 'board' as const },
    ];
    const groups = groupSearchResults(items);
    expect(groups.map((group) => group.entityType)).toEqual(['board', 'card', 'comment']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['2', '4']);
  });

  it('boş giriş için boş dizi döner', () => {
    expect(groupSearchResults([])).toEqual([]);
  });
});
