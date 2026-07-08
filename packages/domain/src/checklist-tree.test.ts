import { describe, expect, it } from 'vitest';
import { buildChecklistTree, collectDescendantItemIds } from './checklist-tree';

/** Test için minimal madde şekli — buildChecklistTree'nin ihtiyaç duyduğu alanlar. */
type Item = { id: string; parentItemId: string | null; position: string };

const item = (id: string, parentItemId: string | null, position: string): Item => ({
  id,
  parentItemId,
  position,
});

describe('buildChecklistTree', () => {
  it('düz listeyi ebeveyn-çocuk ağacına çevirir (3 seviye)', () => {
    const items: Item[] = [
      item('a', null, 'a0'),
      item('a1', 'a', 'a0'),
      item('a1x', 'a1', 'a0'),
      item('b', null, 'a1'),
    ];
    const tree = buildChecklistTree(items);

    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    const a = tree[0]!;
    expect(a.depth).toBe(0);
    expect(a.children.map((n) => n.id)).toEqual(['a1']);
    const a1 = a.children[0]!;
    expect(a1.depth).toBe(1);
    expect(a1.children.map((n) => n.id)).toEqual(['a1x']);
    expect(a1.children[0]!.depth).toBe(2);
  });

  it('her düzeyde kardeşleri position sırasına dizer (giriş sırasından bağımsız)', () => {
    const items: Item[] = [
      item('c', null, 'a2'),
      item('a', null, 'a0'),
      item('b', null, 'a1'),
      // Aynı ebeveynin çocukları da sıralanır.
      item('a-second', 'a', 'a1'),
      item('a-first', 'a', 'a0'),
    ];
    const tree = buildChecklistTree(items);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(['a-first', 'a-second']);
  });

  it('ebeveyni listede olmayan (orphan) maddeyi köke çıkarır — kaybolmaz', () => {
    const items: Item[] = [
      item('root', null, 'a0'),
      // Ebeveyni 'ghost' listede yok → köke çıkar.
      item('orphan', 'ghost', 'a1'),
    ];
    const tree = buildChecklistTree(items);
    expect(tree.map((n) => n.id).sort()).toEqual(['orphan', 'root']);
  });

  it('girdi maddelerini mutate etmez', () => {
    const items: Item[] = [item('a', null, 'a0'), item('a1', 'a', 'a0')];
    const snapshot = JSON.stringify(items);
    buildChecklistTree(items);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('boş liste için boş ağaç döner', () => {
    expect(buildChecklistTree([])).toEqual([]);
  });
});

describe('collectDescendantItemIds', () => {
  it('bir maddenin tüm alt ağaç id\'lerini toplar (kendisi hariç)', () => {
    const items: Item[] = [
      item('a', null, 'a0'),
      item('a1', 'a', 'a0'),
      item('a1x', 'a1', 'a0'),
      item('a2', 'a', 'a1'),
      item('b', null, 'a1'),
    ];
    expect(collectDescendantItemIds(items, 'a').sort()).toEqual(['a1', 'a1x', 'a2']);
    expect(collectDescendantItemIds(items, 'a1')).toEqual(['a1x']);
    expect(collectDescendantItemIds(items, 'b')).toEqual([]);
  });

  it('yaprak / bilinmeyen madde için boş dizi döner', () => {
    const items: Item[] = [item('a', null, 'a0')];
    expect(collectDescendantItemIds(items, 'a')).toEqual([]);
    expect(collectDescendantItemIds(items, 'yok')).toEqual([]);
  });

  it('kendine referans zincirinde sonsuz döngüye girmez', () => {
    // Patolojik: a → b → a (veri bozulması). Döngü guard'ı sonlandırmalı.
    const items: Item[] = [item('a', 'b', 'a0'), item('b', 'a', 'a0')];
    const result = collectDescendantItemIds(items, 'a');
    expect(result).toContain('b');
    // Sonlanır (donmaz) ve 'a' kendini tekrar eklemez.
    expect(result.filter((id) => id === 'a')).toEqual([]);
  });
});
