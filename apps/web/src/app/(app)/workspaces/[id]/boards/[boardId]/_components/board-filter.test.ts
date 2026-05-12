import { describe, expect, it } from 'vitest';
import {
  cardPassesLabelFilter,
  countArchivedLists,
  filterCardsByLabels,
  filterVisibleLists,
  isListArchived,
} from './board-filter';

describe('board-filter helpers', () => {
  const cards = [
    { id: 'c1', labels: [{ labelId: 'l1' }, { labelId: 'l2' }] },
    { id: 'c2', labels: [{ labelId: 'l2' }] },
    { id: 'c3', labels: [] },
  ];

  describe('cardPassesLabelFilter', () => {
    it('passes every card when no labels are selected', () => {
      const none = new Set<string>();
      expect(cards.every((c) => cardPassesLabelFilter(c, none))).toBe(true);
    });

    it('passes a card iff it has at least one selected label', () => {
      const sel = new Set(['l1']);
      expect(cardPassesLabelFilter(cards[0]!, sel)).toBe(true);
      expect(cardPassesLabelFilter(cards[1]!, sel)).toBe(false);
      expect(cardPassesLabelFilter(cards[2]!, sel)).toBe(false);
    });

    it('OR semantics: a card with any of multiple selected labels passes', () => {
      const sel = new Set(['l1', 'l3']);
      expect(cardPassesLabelFilter(cards[0]!, sel)).toBe(true);
      expect(cardPassesLabelFilter(cards[1]!, sel)).toBe(false);
    });
  });

  describe('filterCardsByLabels', () => {
    it('returns a copy of all cards when nothing is selected', () => {
      const out = filterCardsByLabels(cards, new Set());
      expect(out).toEqual(cards);
      expect(out).not.toBe(cards);
    });

    it('keeps only cards matching at least one selected label', () => {
      expect(filterCardsByLabels(cards, new Set(['l2'])).map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(filterCardsByLabels(cards, new Set(['l1'])).map((c) => c.id)).toEqual(['c1']);
      expect(filterCardsByLabels(cards, new Set(['nope'])).map((c) => c.id)).toEqual([]);
    });
  });

  describe('list helpers', () => {
    const lists = [
      { id: 'a', archivedAt: null },
      { id: 'b', archivedAt: new Date('2026-01-01') },
      { id: 'c', archivedAt: null },
      { id: 'd', archivedAt: '2026-02-02' },
    ];

    it('isListArchived', () => {
      expect(isListArchived({ archivedAt: null })).toBe(false);
      expect(isListArchived({ archivedAt: new Date() })).toBe(true);
      expect(isListArchived({ archivedAt: '2026-01-01' })).toBe(true);
    });

    it('filterVisibleLists hides archived lists unless showArchived', () => {
      expect(filterVisibleLists(lists, false).map((l) => l.id)).toEqual(['a', 'c']);
      expect(filterVisibleLists(lists, true).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('countArchivedLists', () => {
      expect(countArchivedLists(lists)).toBe(2);
      expect(countArchivedLists([{ archivedAt: null }])).toBe(0);
    });
  });
});
