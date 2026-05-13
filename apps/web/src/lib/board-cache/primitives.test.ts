import { describe, expect, it } from 'vitest';
import {
  applyBoardPatch,
  applyCardAdd,
  applyCardArchive,
  applyCardMove,
  applyCardPatch,
  applyCardRemove,
  applyListAdd,
  applyListArchive,
  applyListMove,
  applyListPatch,
} from './primitives';

type Card = {
  id: string;
  listId: string;
  position: string;
  title: string;
  archivedAt: string | null;
};
type List = {
  id: string;
  position: string;
  title: string;
  archivedAt: string | null;
};
type Board = { id: string; title: string; version: number };
type Cache = { board: Board; lists: List[]; cards: Card[] };

const fixture = (): Cache => ({
  board: { id: 'b1', title: 'Pano', version: 1 },
  lists: [
    { id: 'L1', position: 'l0', title: 'Yapılacak', archivedAt: null },
    { id: 'L2', position: 'l1', title: 'Bitti', archivedAt: null },
  ],
  cards: [
    { id: 'c1', listId: 'L1', position: 'a0', title: 'bir', archivedAt: null },
    { id: 'c2', listId: 'L1', position: 'a1', title: 'iki', archivedAt: null },
    { id: 'c3', listId: 'L2', position: 'b0', title: 'üç', archivedAt: null },
  ],
});

const positions = <T extends { position: string }>(items: readonly T[]) =>
  items.map((i) => i.position);

describe('applyCardMove', () => {
  it('re-parents a card and re-sorts by position (cross-list)', () => {
    const data = fixture();
    const next = applyCardMove(data, { cardId: 'c1', toListId: 'L2', newPosition: 'b0V' });
    expect(data.cards[0]!.listId).toBe('L1'); // original untouched
    const moved = next.cards.find((c) => c.id === 'c1')!;
    expect(moved.listId).toBe('L2');
    expect(moved.position).toBe('b0V');
    expect(next.cards.filter((c) => c.listId === 'L2').map((c) => c.id)).toEqual(['c3', 'c1']);
    const ps = positions(next.cards);
    expect([...ps].sort()).toEqual(ps);
  });

  it('reorders within the same list', () => {
    const data = fixture();
    const next = applyCardMove(data, { cardId: 'c1', toListId: 'L1', newPosition: 'a2' });
    expect(next.cards.filter((c) => c.listId === 'L1').map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('returns input unchanged when the card is not in cache', () => {
    const data = fixture();
    expect(applyCardMove(data, { cardId: 'nope', toListId: 'L2', newPosition: 'x' })).toBe(data);
  });

  it('returns input unchanged when the card is already at the target list+position (preserves ref)', () => {
    const data = fixture();
    expect(applyCardMove(data, { cardId: 'c1', toListId: 'L1', newPosition: 'a0' })).toBe(data);
  });

  it('keeps board and lists references intact', () => {
    const data = fixture();
    const next = applyCardMove(data, { cardId: 'c1', toListId: 'L2', newPosition: 'b0V' });
    expect(next.board).toBe(data.board);
    expect(next.lists).toBe(data.lists);
  });
});

describe('applyListMove', () => {
  it('moves a list and re-sorts', () => {
    const data = fixture();
    const next = applyListMove(data, { listId: 'L2', newPosition: 'kZ' });
    expect(data.lists[0]!.id).toBe('L1');
    expect(next.lists.map((l) => l.id)).toEqual(['L2', 'L1']);
    expect(next.lists.find((l) => l.id === 'L2')!.position).toBe('kZ');
    expect(next.cards).toBe(data.cards);
  });

  it('returns input unchanged when the list is not in cache', () => {
    const data = fixture();
    expect(applyListMove(data, { listId: 'nope', newPosition: 'x' })).toBe(data);
  });

  it('returns input unchanged when the list is already at the target position (preserves ref)', () => {
    const data = fixture();
    expect(applyListMove(data, { listId: 'L2', newPosition: 'l1' })).toBe(data);
  });
});

describe('applyCardPatch', () => {
  it('patches a single card, keeps the rest intact', () => {
    const data = fixture();
    const next = applyCardPatch(data, 'c2', { title: 'iki — güncellendi' });
    expect(next.cards.find((c) => c.id === 'c2')!.title).toBe('iki — güncellendi');
    expect(next.cards.find((c) => c.id === 'c1')).toBe(data.cards.find((c) => c.id === 'c1'));
    expect(next.lists).toBe(data.lists);
    expect(next.board).toBe(data.board);
  });

  it('returns input unchanged when card is missing', () => {
    const data = fixture();
    expect(applyCardPatch(data, 'nope', { title: 'x' })).toBe(data);
  });

  it('re-sorts cards when the patch changes position', () => {
    const data = fixture();
    const next = applyCardPatch(data, 'c1', { position: 'a2' });
    expect(next.cards.filter((c) => c.listId === 'L1').map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});

describe('applyCardAdd', () => {
  it('appends a new card and keeps cards position-sorted', () => {
    const data = fixture();
    const newCard: Card = { id: 'c4', listId: 'L1', position: 'a05', title: 'a-buçuk', archivedAt: null };
    const next = applyCardAdd(data, newCard);
    expect(next.cards.map((c) => c.id)).toEqual(['c1', 'c4', 'c2', 'c3']);
    expect(data.cards).toHaveLength(3); // original untouched
  });

  it('returns input unchanged if a card with the same id already exists', () => {
    const data = fixture();
    const dup: Card = { id: 'c1', listId: 'L2', position: 'b1', title: 'dup', archivedAt: null };
    expect(applyCardAdd(data, dup)).toBe(data);
  });
});

describe('applyCardRemove', () => {
  it('removes a card by id', () => {
    const data = fixture();
    const next = applyCardRemove(data, 'c2');
    expect(next.cards.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('returns input unchanged when the card is missing', () => {
    const data = fixture();
    expect(applyCardRemove(data, 'nope')).toBe(data);
  });
});

describe('applyCardArchive', () => {
  it('drops the card from the cache (board.get only returns active cards)', () => {
    const data = fixture();
    const next = applyCardArchive(data, 'c1');
    expect(next.cards.map((c) => c.id)).toEqual(['c2', 'c3']);
    expect(next.lists).toBe(data.lists);
  });

  it('returns input unchanged when the card is missing', () => {
    const data = fixture();
    expect(applyCardArchive(data, 'nope')).toBe(data);
  });
});

describe('applyListAdd', () => {
  it('appends a new list and keeps lists position-sorted', () => {
    const data = fixture();
    const newList: List = { id: 'L3', position: 'l05', title: 'Devam', archivedAt: null };
    const next = applyListAdd(data, newList);
    expect(next.lists.map((l) => l.id)).toEqual(['L1', 'L3', 'L2']);
    expect(data.lists).toHaveLength(2);
  });

  it('returns input unchanged when a list with the same id already exists', () => {
    const data = fixture();
    const dup: List = { id: 'L1', position: 'z', title: 'dup', archivedAt: null };
    expect(applyListAdd(data, dup)).toBe(data);
  });
});

describe('applyListPatch', () => {
  it('patches a single list', () => {
    const data = fixture();
    const next = applyListPatch(data, 'L1', { title: 'Yeniden adlandırıldı' });
    expect(next.lists.find((l) => l.id === 'L1')!.title).toBe('Yeniden adlandırıldı');
    expect(next.cards).toBe(data.cards);
  });

  it('returns input unchanged when the list is missing', () => {
    const data = fixture();
    expect(applyListPatch(data, 'nope', { title: 'x' })).toBe(data);
  });

  it('re-sorts lists when the patch changes position', () => {
    const data = fixture();
    const next = applyListPatch(data, 'L2', { position: 'kZ' });
    expect(next.lists.map((l) => l.id)).toEqual(['L2', 'L1']);
  });
});

describe('applyListArchive', () => {
  it('sets archivedAt on the list (board.get still returns archived lists)', () => {
    const data = fixture();
    const next = applyListArchive(data, 'L1', '2026-05-13T10:00:00.000Z');
    const archived = next.lists.find((l) => l.id === 'L1')!;
    expect(archived.archivedAt).toBe('2026-05-13T10:00:00.000Z');
    expect(next.lists.map((l) => l.id)).toEqual(['L1', 'L2']); // order intact
    expect(next.cards).toBe(data.cards);
  });

  it('unarchives a list when archivedAt is null', () => {
    const archivedFixture: Cache = {
      ...fixture(),
      lists: [
        { id: 'L1', position: 'l0', title: 'Yapılacak', archivedAt: '2026-05-13T10:00:00.000Z' },
        { id: 'L2', position: 'l1', title: 'Bitti', archivedAt: null },
      ],
    };
    const next = applyListArchive(archivedFixture, 'L1', null);
    expect(next.lists.find((l) => l.id === 'L1')!.archivedAt).toBeNull();
  });

  it('returns input unchanged when the list is missing', () => {
    const data = fixture();
    expect(applyListArchive(data, 'nope', '2026-05-13T10:00:00.000Z')).toBe(data);
  });
});

describe('applyBoardPatch', () => {
  it('patches board fields', () => {
    const data = fixture();
    const next = applyBoardPatch(data, { title: 'Yeni başlık', version: 2 });
    expect(next.board.title).toBe('Yeni başlık');
    expect(next.board.version).toBe(2);
    expect(next.lists).toBe(data.lists);
    expect(next.cards).toBe(data.cards);
  });
});
