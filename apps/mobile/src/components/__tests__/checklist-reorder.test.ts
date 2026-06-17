import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  isOptimisticItemId,
  moveId,
  neighboursForReorder,
} from '@/lib/checklist-reorder';

/**
 * Kontrol listesi sürükle-bırak sıralama saf yardımcıları (DEM — manuel
 * reanimated sortable). Komşu hesabı + sıra dizimi UI/gesture'dan bağımsız
 * test edilir; özellikle optimistic madde komşulardan dışlanmalı.
 */

describe('moveId', () => {
  it('bir maddeyi yukarıdan aşağı taşır (immutable)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(moveId(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    // Kaynak mutate edilmemeli.
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bir maddeyi aşağıdan yukarı taşır', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('no-op / geçersiz taşımada girdiyi (yeni dizi olarak) döndürür', () => {
    expect(moveId(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('isOptimisticItemId', () => {
  it('optimistic- ön ekli id\'leri tanır', () => {
    expect(isOptimisticItemId('optimistic-123')).toBe(true);
    expect(isOptimisticItemId('item-123')).toBe(false);
  });
});

describe('neighboursForReorder', () => {
  it('ortaya taşımada her iki gerçek komşuyu verir', () => {
    // Sıra: a, [c taşındı], b  → c'nin komşuları a (before) ve b (after).
    const ordered = ['a', 'c', 'b'];
    expect(neighboursForReorder(ordered, 'c')).toEqual({
      beforeItemId: 'a',
      afterItemId: 'b',
    });
  });

  it('liste başına taşımada beforeItemId undefined', () => {
    const ordered = ['c', 'a', 'b'];
    expect(neighboursForReorder(ordered, 'c')).toEqual({
      beforeItemId: undefined,
      afterItemId: 'a',
    });
  });

  it('liste sonuna taşımada afterItemId undefined', () => {
    const ordered = ['a', 'b', 'c'];
    expect(neighboursForReorder(ordered, 'c')).toEqual({
      beforeItemId: 'b',
      afterItemId: undefined,
    });
  });

  it('optimistic komşuları atlar — gerçek (kalıcı) komşuya genişler', () => {
    // Taşınan x; hemen önünde optimistic, ondan önce gerçek 'a'; hemen ardında
    // optimistic, ondan sonra gerçek 'b'. Backend gerçek komşu bekler.
    const ordered = ['a', 'optimistic-1', 'x', 'optimistic-2', 'b'];
    expect(neighboursForReorder(ordered, 'x')).toEqual({
      beforeItemId: 'a',
      afterItemId: 'b',
    });
  });

  it('ardışık çoklu optimistic komşuyu atlar — ilk gerçek komşuya genişler', () => {
    // Taşınan x'in hemen önünde iki ardışık optimistic madde; ondan önce gerçek
    // 'a'. Backend gerçek komşu beklediğinden before='a' olmalı (her iki
    // optimistic atlanır). x liste sonunda → after undefined.
    const ordered = ['a', 'optimistic-1', 'optimistic-2', 'x'];
    expect(neighboursForReorder(ordered, 'x')).toEqual({
      beforeItemId: 'a',
      afterItemId: undefined,
    });
  });

  it('yalnız optimistic komşular varsa undefined döner', () => {
    const ordered = ['optimistic-1', 'x', 'optimistic-2'];
    expect(neighboursForReorder(ordered, 'x')).toEqual({
      beforeItemId: undefined,
      afterItemId: undefined,
    });
  });

  it('madde bulunamazsa ikisi de undefined', () => {
    expect(neighboursForReorder(['a', 'b'], 'z')).toEqual({
      beforeItemId: undefined,
      afterItemId: undefined,
    });
  });
});

describe('applyOrder', () => {
  it('maddeleri verilen id sırasına göre yeniden dizer (immutable)', () => {
    const items = [
      { id: 'a', content: 'A' },
      { id: 'b', content: 'B' },
      { id: 'c', content: 'C' },
    ];
    const result = applyOrder(items, ['c', 'a', 'b']);
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    // Kaynak mutate edilmemeli.
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('sırada olmayan id\'leri atlar', () => {
    const items = [
      { id: 'a', content: 'A' },
      { id: 'b', content: 'B' },
    ];
    expect(applyOrder(items, ['b', 'z', 'a']).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('orderedIds\'te olup items\'ta olmayan id\'yi atlar', () => {
    // 'z' sıraya dahil ama items'ta yok → sessizce yok sayılır; yalnız mevcut
    // maddeler verilen sırada döner (yarış/eski sıra durumunda çökmemeli).
    const items = [
      { id: 'a', content: 'A' },
      { id: 'b', content: 'B' },
    ];
    expect(applyOrder(items, ['z', 'b', 'a']).map((i) => i.id)).toEqual(['b', 'a']);
  });
});
