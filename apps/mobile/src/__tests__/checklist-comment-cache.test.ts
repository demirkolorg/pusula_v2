import { describe, expect, it } from 'vitest';
import type { RouterOutputs } from '@pusula/api';
import { applyCommentCountDelta } from '../lib/checklist-comment-cache';

/**
 * `applyCommentCountDelta` saf dönüşüm birim testleri — madde yorum rozetinin
 * (`commentCount`) optimistic +1 / -1 yaması (yapılacaklar maddesine yorum).
 */

type Checklists = RouterOutputs['checklist']['list'];
type ChecklistItem = Checklists[number]['items'][number];

const now = new Date('2026-06-03T00:00:00.000Z');

function makeItem(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return {
    checklistId: 'cl-1',
    parentItemId: null,
    depth: 0,
    content: 'Madde',
    position: 'a0',
    completed: false,
    completedAt: null,
    completedBy: null,
    commentCount: 0,
    attachmentCount: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makeLists(items: ChecklistItem[]): Checklists {
  return [
    {
      id: 'cl-1',
      cardId: 'card-1',
      title: 'Liste',
      position: 'a0',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      items,
    },
  ];
}

describe('applyCommentCountDelta', () => {
  it('ilgili maddenin commentCount değerini +1 yamalar', () => {
    const lists = makeLists([makeItem({ id: 'i-1', commentCount: 2 })]);
    const next = applyCommentCountDelta(lists, 'i-1', +1);
    expect(next[0]?.items[0]?.commentCount).toBe(3);
  });

  it('commentCount değerini -1 yamalar', () => {
    const lists = makeLists([makeItem({ id: 'i-1', commentCount: 2 })]);
    const next = applyCommentCountDelta(lists, 'i-1', -1);
    expect(next[0]?.items[0]?.commentCount).toBe(1);
  });

  it('sayı negatife düşmez (Math.max 0)', () => {
    const lists = makeLists([makeItem({ id: 'i-1', commentCount: 0 })]);
    const next = applyCommentCountDelta(lists, 'i-1', -1);
    // 0 → 0: değişiklik yok, aynı referans döner.
    expect(next).toBe(lists);
    expect(next[0]?.items[0]?.commentCount).toBe(0);
  });

  it('girişi mutate etmez (immutability)', () => {
    const lists = makeLists([makeItem({ id: 'i-1', commentCount: 1 })]);
    applyCommentCountDelta(lists, 'i-1', +1);
    expect(lists[0]?.items[0]?.commentCount).toBe(1);
  });

  it('yalnız hedef madde yeni nesne olur; diğerleri referansla korunur', () => {
    const a = makeItem({ id: 'i-1', commentCount: 0 });
    const b = makeItem({ id: 'i-2', commentCount: 5 });
    const lists = makeLists([a, b]);
    const next = applyCommentCountDelta(lists, 'i-1', +1);
    expect(next).not.toBe(lists);
    expect(next[0]?.items[0]).not.toBe(a); // hedef değişti
    expect(next[0]?.items[1]).toBe(b); // dokunulmadı
  });

  it('madde hiçbir listede yoksa aynı referansı döndürür', () => {
    const lists = makeLists([makeItem({ id: 'i-1' })]);
    const next = applyCommentCountDelta(lists, 'yok', +1);
    expect(next).toBe(lists);
  });

  it('boş liste için aynı (boş) referansı döndürür', () => {
    const lists: Checklists = [];
    expect(applyCommentCountDelta(lists, 'i-1', +1)).toBe(lists);
  });
});
