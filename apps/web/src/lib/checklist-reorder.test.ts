import { describe, expect, it } from 'vitest';
import { comparePosition } from '@pusula/domain';
import {
  OPTIMISTIC_PREFIX,
  applyOrder,
  isOptimisticItemId,
  moveId,
  neighboursForReorder,
  planChecklistReorder,
} from './checklist-reorder';

/**
 * Kontrol listesi (web) sürükle-bırak sıralama saf yardımcıları (DEM — web'e
 * taşıma). Komşu hesabı + sıra dizimi + drop planı UI/gesture'dan bağımsız test
 * edilir. Mobil `checklist-reorder.ts` ile aynı saf çekirdek; web ayrıca drop
 * target id + edge'den plan (yeni komşular + optimistic newPosition) hesaplar.
 */

describe('moveId', () => {
  it('bir maddeyi yukarıdan aşağı taşır (immutable)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(moveId(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
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
  it("optimistic- ön ekli id'leri tanır", () => {
    expect(isOptimisticItemId(`${OPTIMISTIC_PREFIX}123`)).toBe(true);
    expect(isOptimisticItemId('item-123')).toBe(false);
  });
});

describe('neighboursForReorder', () => {
  it('ortaya taşımada her iki gerçek komşuyu verir', () => {
    expect(neighboursForReorder(['a', 'c', 'b'], 'c')).toEqual({
      beforeItemId: 'a',
      afterItemId: 'b',
    });
  });

  it('liste başına taşımada beforeItemId undefined', () => {
    expect(neighboursForReorder(['c', 'a', 'b'], 'c')).toEqual({
      beforeItemId: undefined,
      afterItemId: 'a',
    });
  });

  it('liste sonuna taşımada afterItemId undefined', () => {
    expect(neighboursForReorder(['a', 'b', 'c'], 'c')).toEqual({
      beforeItemId: 'b',
      afterItemId: undefined,
    });
  });

  it('optimistic komşuları atlar — gerçek (kalıcı) komşuya genişler', () => {
    const ordered = ['a', `${OPTIMISTIC_PREFIX}1`, 'x', `${OPTIMISTIC_PREFIX}2`, 'b'];
    expect(neighboursForReorder(ordered, 'x')).toEqual({
      beforeItemId: 'a',
      afterItemId: 'b',
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
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it("sırada olmayan id'leri atlar", () => {
    const items = [
      { id: 'a', content: 'A' },
      { id: 'b', content: 'B' },
    ];
    expect(applyOrder(items, ['b', 'z', 'a']).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('planChecklistReorder', () => {
  // `items` cache'teki (rastgele sıralı olabilir) maddeler — plan önce position'a
  // göre sıralar, taşınanı çıkarır, hedef komşunun edge'ine göre yerleştirir.
  // Geçerli fractional-indexing anahtarları (generateNKeysBetween(null,null,3)).
  const POS = { a: 'a0', b: 'a1', c: 'a2' } as const;
  const items = [
    { id: 'a', position: POS.a },
    { id: 'b', position: POS.b },
    { id: 'c', position: POS.c },
  ];

  it('maddeyi başka bir maddenin ÜSTÜNE bırakır (top edge)', () => {
    // c'yi a'nın üstüne → sıra c,a,b; c'nin komşuları: before yok, after a.
    const plan = planChecklistReorder({
      items,
      movedItemId: 'c',
      targetItemId: 'a',
      edge: 'top',
    });
    expect(plan).not.toBeNull();
    expect(plan?.orderedIds).toEqual(['c', 'a', 'b']);
    expect(plan?.beforeItemId).toBeUndefined();
    expect(plan?.afterItemId).toBe('a');
    expect(plan?.newPosition).toBeTruthy();
    // Yeni pozisyon a'dan küçük olmalı (en başa geçti).
    expect(comparePosition(plan!.newPosition, POS.a)).toBeLessThan(0);
  });

  it('maddeyi başka bir maddenin ALTINA bırakır (bottom edge)', () => {
    // a'yı b'nin altına → sıra b,a,c; a'nın komşuları: before b, after c.
    const plan = planChecklistReorder({
      items,
      movedItemId: 'a',
      targetItemId: 'b',
      edge: 'bottom',
    });
    expect(plan?.orderedIds).toEqual(['b', 'a', 'c']);
    expect(plan?.beforeItemId).toBe('b');
    expect(plan?.afterItemId).toBe('c');
    expect(comparePosition(plan!.newPosition, POS.b)).toBeGreaterThan(0);
    expect(comparePosition(plan!.newPosition, POS.c)).toBeLessThan(0);
  });

  it('maddeyi listenin SONUNA bırakır', () => {
    // a'yı c'nin altına → sıra b,c,a; a'nın komşuları: before c, after yok.
    const plan = planChecklistReorder({
      items,
      movedItemId: 'a',
      targetItemId: 'c',
      edge: 'bottom',
    });
    expect(plan?.orderedIds).toEqual(['b', 'c', 'a']);
    expect(plan?.beforeItemId).toBe('c');
    expect(plan?.afterItemId).toBeUndefined();
    expect(comparePosition(plan!.newPosition, POS.c)).toBeGreaterThan(0);
  });

  it('aynı yere bırakınca no-op (null döner)', () => {
    // b'yi a'nın altına = zaten orada (a,b,c). No-op.
    expect(
      planChecklistReorder({ items, movedItemId: 'b', targetItemId: 'a', edge: 'bottom' }),
    ).toBeNull();
    // b'yi c'nin üstüne = zaten orada. No-op.
    expect(
      planChecklistReorder({ items, movedItemId: 'b', targetItemId: 'c', edge: 'top' }),
    ).toBeNull();
  });

  it('maddeyi kendi üstüne/altına bırakınca no-op', () => {
    expect(
      planChecklistReorder({ items, movedItemId: 'b', targetItemId: 'b', edge: 'top' }),
    ).toBeNull();
  });

  it('cache sırası karışıksa önce position ile sıralar', () => {
    const shuffled = [
      { id: 'c', position: POS.c },
      { id: 'a', position: POS.a },
      { id: 'b', position: POS.b },
    ];
    const plan = planChecklistReorder({
      items: shuffled,
      movedItemId: 'c',
      targetItemId: 'a',
      edge: 'top',
    });
    expect(plan?.orderedIds).toEqual(['c', 'a', 'b']);
  });

  it('hedef/taşınan bulunamazsa null döner', () => {
    expect(
      planChecklistReorder({ items, movedItemId: 'z', targetItemId: 'a', edge: 'top' }),
    ).toBeNull();
    expect(
      planChecklistReorder({ items, movedItemId: 'a', targetItemId: 'z', edge: 'top' }),
    ).toBeNull();
  });

  it('optimistic komşuyu backend için atlar ama görsel sırayı korur', () => {
    // Sıra: a, optimistic-1, b. b'yi optimistic-1'in üstüne taşı → görsel sıra
    // a, b, optimistic-1; b'nin gerçek komşuları before a, after undefined
    // (optimistic-1 atlanır).
    const withOptimistic = [
      { id: 'a', position: POS.a },
      { id: `${OPTIMISTIC_PREFIX}1`, position: POS.b },
      { id: 'b', position: POS.c },
    ];
    const plan = planChecklistReorder({
      items: withOptimistic,
      movedItemId: 'b',
      targetItemId: `${OPTIMISTIC_PREFIX}1`,
      edge: 'top',
    });
    expect(plan?.orderedIds).toEqual(['a', 'b', `${OPTIMISTIC_PREFIX}1`]);
    expect(plan?.beforeItemId).toBe('a');
    expect(plan?.afterItemId).toBeUndefined();
  });
});
