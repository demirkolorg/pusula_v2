import { describe, expect, it } from 'vitest';
import { applyCardMoveToBoardCache, applyListMoveToBoardCache } from './board-dnd-cache';

type Card = { id: string; listId: string; position: string; title: string };
type List = { id: string; position: string; title: string };
type BoardData = { board: { id: string }; lists: List[]; cards: Card[] };

const fixture = (): BoardData => ({
  board: { id: 'b1' },
  lists: [
    { id: 'L1', position: 'l0', title: 'A' },
    { id: 'L2', position: 'l1', title: 'B' },
  ],
  cards: [
    { id: 'c1', listId: 'L1', position: 'a0', title: 'one' },
    { id: 'c2', listId: 'L1', position: 'a1', title: 'two' },
    { id: 'c3', listId: 'L2', position: 'b0', title: 'three' },
  ],
});

describe('applyCardMoveToBoardCache', () => {
  it('re-parents a card and re-sorts by position (cross-list)', () => {
    const data = fixture();
    const next = applyCardMoveToBoardCache(data, { cardId: 'c1', toListId: 'L2', newPosition: 'b0V' });
    // Original untouched (immutable update).
    expect(data.cards[0]!.listId).toBe('L1');
    // c1 moved to L2 with the new position; L2's cards now [c3, c1] by position.
    const moved = next.cards.find((c) => c.id === 'c1')!;
    expect(moved.listId).toBe('L2');
    expect(moved.position).toBe('b0V');
    const l2 = next.cards.filter((c) => c.listId === 'L2').map((c) => c.id);
    expect(l2).toEqual(['c3', 'c1']);
    // Whole array stays position-sorted.
    const positions = next.cards.map((c) => c.position);
    expect([...positions].sort()).toEqual(positions);
  });

  it('reorders a card within its list', () => {
    const data = fixture();
    const next = applyCardMoveToBoardCache(data, { cardId: 'c1', toListId: 'L1', newPosition: 'a2' });
    const l1 = next.cards.filter((c) => c.listId === 'L1').map((c) => c.id);
    expect(l1).toEqual(['c2', 'c1']);
  });

  it('returns the input unchanged when the card is not in the cache', () => {
    const data = fixture();
    const next = applyCardMoveToBoardCache(data, { cardId: 'nope', toListId: 'L2', newPosition: 'x' });
    expect(next).toBe(data);
  });

  it('keeps non-card fields intact', () => {
    const data = fixture();
    const next = applyCardMoveToBoardCache(data, { cardId: 'c1', toListId: 'L2', newPosition: 'b0V' });
    expect(next.board).toBe(data.board);
    expect(next.lists).toBe(data.lists);
  });
});

describe('applyListMoveToBoardCache', () => {
  it('moves a list and re-sorts', () => {
    const data = fixture();
    const next = applyListMoveToBoardCache(data, { listId: 'L2', newPosition: 'kZ' });
    expect(data.lists[0]!.id).toBe('L1'); // original untouched
    expect(next.lists.map((l) => l.id)).toEqual(['L2', 'L1']);
    expect(next.lists.find((l) => l.id === 'L2')!.position).toBe('kZ');
    expect(next.cards).toBe(data.cards);
  });

  it('returns the input unchanged when the list is not in the cache', () => {
    const data = fixture();
    expect(applyListMoveToBoardCache(data, { listId: 'nope', newPosition: 'x' })).toBe(data);
  });
});
