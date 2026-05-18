import { describe, expect, it } from 'vitest';
import { cardPassesLabelFilter, filterCardsByLabels } from '../lib/board-filter';

/** Faz 7E-2 (DEM-200) — board etiket filtresi saf-fonksiyon birim testleri. */

type Card = { id: string; labels: { labelId: string }[] };

const cards: Card[] = [
  { id: 'a', labels: [{ labelId: 'red' }, { labelId: 'blue' }] },
  { id: 'b', labels: [{ labelId: 'green' }] },
  { id: 'c', labels: [] },
];

describe('cardPassesLabelFilter', () => {
  it('boş seçimde her kart geçer', () => {
    const none = new Set<string>();
    expect(cardPassesLabelFilter(cards[0]!, none)).toBe(true);
    expect(cardPassesLabelFilter(cards[2]!, none)).toBe(true);
  });

  it('kart seçili etiketlerden en az birini taşıyorsa geçer (OR)', () => {
    expect(cardPassesLabelFilter(cards[0]!, new Set(['blue']))).toBe(true);
    expect(cardPassesLabelFilter(cards[0]!, new Set(['green', 'red']))).toBe(true);
  });

  it('kart seçili etiketlerin hiçbirini taşımıyorsa geçmez', () => {
    expect(cardPassesLabelFilter(cards[0]!, new Set(['green']))).toBe(false);
    expect(cardPassesLabelFilter(cards[2]!, new Set(['red']))).toBe(false);
  });
});

describe('filterCardsByLabels', () => {
  it('boş seçimde tüm kartların kopyasını döner', () => {
    const result = filterCardsByLabels(cards, new Set());
    expect(result).toEqual(cards);
    expect(result).not.toBe(cards);
  });

  it('kart nesnelerini mutate etmeden sığ kopya döner', () => {
    const result = filterCardsByLabels(cards, new Set(['red']));
    expect(result[0]).toBe(cards[0]);
  });

  it('yalnız seçili etiketlerden birini taşıyan kartları döner', () => {
    expect(filterCardsByLabels(cards, new Set(['red'])).map((c) => c.id)).toEqual(['a']);
    expect(filterCardsByLabels(cards, new Set(['blue', 'green'])).map((c) => c.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('eşleşme yoksa boş dizi döner', () => {
    expect(filterCardsByLabels(cards, new Set(['yellow']))).toEqual([]);
  });
});
