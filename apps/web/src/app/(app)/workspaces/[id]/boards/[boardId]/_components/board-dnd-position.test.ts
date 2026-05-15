import { describe, expect, it } from 'vitest';
import {
  planCardMove,
  planCardMoveToListEnd,
  planListMove,
  planListMoveByOne,
  type CardSibling,
} from './board-dnd-position';

/** Build a `cardsByListId` lookup over a fixed shape. */
function makeCards(byList: Record<string, CardSibling[]>) {
  return (listId: string): CardSibling[] => byList[listId] ?? [];
}

describe('planCardMove', () => {
  // List A: a (a0), b (a1), c (a2). List B: x (a0), y (a1). List C: empty.
  // (Positions are per-list scoped; we use valid `fractional-indexing` keys so
  // `positionBetween` doesn't reject them.)
  const cardsByListId = makeCards({
    A: [
      { id: 'a', position: 'a0' },
      { id: 'b', position: 'a1' },
      { id: 'c', position: 'a2' },
    ],
    B: [
      { id: 'x', position: 'a0' },
      { id: 'y', position: 'a1' },
    ],
    C: [],
  });

  it('reorder within a list: drop `c` above `a` ⇒ before=∅, after=a', () => {
    const plan = planCardMove({
      cardId: 'c',
      fromListId: 'A',
      toListId: 'A',
      targetCardId: 'a',
      edge: 'top',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBeNull();
    expect(plan!.afterCardId).toBe('a');
    expect(plan!.toListId).toBe('A');
    expect(plan!.newPosition! < 'a0').toBe(true);
  });

  it('reorder within a list: drop `a` below `b` ⇒ between b and c', () => {
    const plan = planCardMove({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'A',
      targetCardId: 'b',
      edge: 'bottom',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBe('b');
    expect(plan!.afterCardId).toBe('c');
    expect(plan!.newPosition! > 'a1' && plan!.newPosition! < 'a2').toBe(true);
  });

  it('reorder within a list: drop `a` above `c` ⇒ between b and c (a removed from siblings first)', () => {
    const plan = planCardMove({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'A',
      targetCardId: 'c',
      edge: 'top',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBe('b');
    expect(plan!.afterCardId).toBe('c');
  });

  it('no-op: drop `b` above `c` ⇒ same gap it already occupies', () => {
    // Removing `b`, siblings are [a, c]; dropping above `c` lands between a and c
    // — which is exactly where `b` already sits → no move.
    expect(
      planCardMove({
        cardId: 'b',
        fromListId: 'A',
        toListId: 'A',
        targetCardId: 'c',
        edge: 'top',
        cardsByListId,
      }),
    ).toBeNull();
  });

  it('no-op: drop `b` below `a` ⇒ same gap', () => {
    expect(
      planCardMove({
        cardId: 'b',
        fromListId: 'A',
        toListId: 'A',
        targetCardId: 'a',
        edge: 'bottom',
        cardsByListId,
      }),
    ).toBeNull();
  });

  it('no-op: dropped onto itself', () => {
    expect(
      planCardMove({
        cardId: 'b',
        fromListId: 'A',
        toListId: 'A',
        targetCardId: 'b',
        edge: 'top',
        cardsByListId,
      }),
    ).toBeNull();
    expect(
      planCardMove({
        cardId: 'b',
        fromListId: 'A',
        toListId: 'A',
        targetCardId: 'b',
        edge: 'bottom',
        cardsByListId,
      }),
    ).toBeNull();
  });

  it('cross-list move: drop `a` above `y` in list B ⇒ between x and y, toListId=B', () => {
    const plan = planCardMove({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'B',
      targetCardId: 'y',
      edge: 'top',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.fromListId).toBe('A');
    expect(plan!.toListId).toBe('B');
    expect(plan!.beforeCardId).toBe('x');
    expect(plan!.afterCardId).toBe('y');
    expect(plan!.newPosition! > 'a0' && plan!.newPosition! < 'a1').toBe(true);
  });

  it('cross-list move onto an empty column body (targetCardId=null) ⇒ end of list C', () => {
    const plan = planCardMove({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'C',
      targetCardId: null,
      edge: 'bottom',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.toListId).toBe('C');
    expect(plan!.beforeCardId).toBeNull();
    expect(plan!.afterCardId).toBeNull();
  });

  it('drop on the end of the *own* list (targetCardId=null) ⇒ after the last card', () => {
    const plan = planCardMove({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'A',
      targetCardId: null,
      edge: 'bottom',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBe('c'); // last of [b, c] after removing `a`
    expect(plan!.afterCardId).toBeNull();
    expect(plan!.newPosition! > 'a2').toBe(true);
  });

  it('no-op: the last card dropped on the end of its own list', () => {
    expect(
      planCardMove({
        cardId: 'c',
        fromListId: 'A',
        toListId: 'A',
        targetCardId: null,
        edge: 'bottom',
        cardsByListId,
      }),
    ).toBeNull();
  });

  it('legacy invalid positions do not crash the drag monitor', () => {
    const legacyCardsByListId = makeCards({
      A: [
        { id: 'a', position: 'a' },
        { id: 'b', position: 'b' },
        { id: 'c', position: 'c' },
      ],
    });

    const plan = planCardMove({
      cardId: 'c',
      fromListId: 'A',
      toListId: 'A',
      targetCardId: 'a',
      edge: 'top',
      cardsByListId: legacyCardsByListId,
    });

    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBeNull();
    expect(plan!.afterCardId).toBe('a');
    expect(plan!.newPosition).toBeNull();
  });
});

describe('planCardMoveToListEnd', () => {
  const cardsByListId = makeCards({
    A: [
      { id: 'a', position: 'a0' },
      { id: 'b', position: 'a1' },
    ],
    B: [{ id: 'x', position: 'a0' }],
    C: [],
  });

  it('appends to a non-empty target list (after its last card)', () => {
    const plan = planCardMoveToListEnd({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'B',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.toListId).toBe('B');
    expect(plan!.beforeCardId).toBe('x');
    expect(plan!.afterCardId).toBeNull();
    expect(plan!.newPosition! > 'a0').toBe(true);
  });

  it('appends to an empty target list (head position)', () => {
    const plan = planCardMoveToListEnd({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'C',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBeNull();
    expect(plan!.afterCardId).toBeNull();
  });

  it('no-op when the card is already last in its own list', () => {
    expect(
      planCardMoveToListEnd({ cardId: 'b', fromListId: 'A', toListId: 'A', cardsByListId }),
    ).toBeNull();
  });

  it('same-list "to end" for a non-last card moves it to the end', () => {
    const plan = planCardMoveToListEnd({
      cardId: 'a',
      fromListId: 'A',
      toListId: 'A',
      cardsByListId,
    });
    expect(plan).not.toBeNull();
    expect(plan!.beforeCardId).toBe('b'); // after removing `a`, the only sibling is `b`
    expect(plan!.afterCardId).toBeNull();
  });
});

describe('planListMove', () => {
  // Columns: p (a0), q (a1), r (a2).
  const lists: CardSibling[] = [
    { id: 'p', position: 'a0' },
    { id: 'q', position: 'a1' },
    { id: 'r', position: 'a2' },
  ];

  it('drop `r` to the left of `p` ⇒ before=∅, after=p', () => {
    const plan = planListMove({ listId: 'r', targetListId: 'p', edge: 'left', lists });
    expect(plan).not.toBeNull();
    expect(plan!.beforeListId).toBeNull();
    expect(plan!.afterListId).toBe('p');
    expect(plan!.newPosition! < 'a0').toBe(true);
  });

  it('drop `p` to the right of `q` ⇒ between q and r', () => {
    const plan = planListMove({ listId: 'p', targetListId: 'q', edge: 'right', lists });
    expect(plan).not.toBeNull();
    expect(plan!.beforeListId).toBe('q');
    expect(plan!.afterListId).toBe('r');
  });

  it('no-op: drop onto itself', () => {
    expect(planListMove({ listId: 'q', targetListId: 'q', edge: 'left', lists })).toBeNull();
  });

  it('no-op: drop `q` to the right of `p` (the gap it already occupies)', () => {
    expect(planListMove({ listId: 'q', targetListId: 'p', edge: 'right', lists })).toBeNull();
  });

  it('no-op: drop `q` to the left of `r` (the gap it already occupies)', () => {
    expect(planListMove({ listId: 'q', targetListId: 'r', edge: 'left', lists })).toBeNull();
  });
});

describe('planListMoveByOne', () => {
  const lists: CardSibling[] = [
    { id: 'p', position: 'a0' },
    { id: 'q', position: 'a1' },
    { id: 'r', position: 'a2' },
  ];

  it('move `q` left ⇒ before=∅, after=p', () => {
    const plan = planListMoveByOne({ listId: 'q', direction: 'left', lists });
    expect(plan).not.toBeNull();
    expect(plan!.beforeListId).toBeNull();
    expect(plan!.afterListId).toBe('p');
    expect(plan!.newPosition! < 'a0').toBe(true);
  });

  it('move `q` right ⇒ before=r, after=∅', () => {
    const plan = planListMoveByOne({ listId: 'q', direction: 'right', lists });
    expect(plan).not.toBeNull();
    expect(plan!.beforeListId).toBe('r');
    expect(plan!.afterListId).toBeNull();
    expect(plan!.newPosition! > 'a2').toBe(true);
  });

  it('move `p` right ⇒ between q and r', () => {
    const plan = planListMoveByOne({ listId: 'p', direction: 'right', lists });
    expect(plan).not.toBeNull();
    expect(plan!.beforeListId).toBe('q');
    expect(plan!.afterListId).toBe('r');
  });

  it('no-op at the left edge', () => {
    expect(planListMoveByOne({ listId: 'p', direction: 'left', lists })).toBeNull();
  });

  it('no-op at the right edge', () => {
    expect(planListMoveByOne({ listId: 'r', direction: 'right', lists })).toBeNull();
  });

  it('no-op for an unknown list', () => {
    expect(planListMoveByOne({ listId: 'zzz', direction: 'left', lists })).toBeNull();
  });
});
