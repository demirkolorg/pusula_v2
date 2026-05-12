import { describe, expect, it } from 'vitest';
import { summarizeCardActivity, type CardActivityEvent } from './activity-summary';

const base: CardActivityEvent = {
  id: 'a1',
  type: 'card.created',
  actorId: 'u1',
  actorName: 'Ada',
  payload: {},
  createdAt: new Date('2026-01-01'),
};

describe('summarizeCardActivity', () => {
  it('card.created → "<actor> kartı oluşturdu"', () => {
    expect(summarizeCardActivity(base, 'Bir kullanıcı')).toBe('Ada kartı oluşturdu');
  });

  it('card.renamed → includes from/to titles when present', () => {
    expect(
      summarizeCardActivity(
        { ...base, type: 'card.renamed', payload: { fromTitle: 'Eski', toTitle: 'Yeni' } },
        'Bir kullanıcı',
      ),
    ).toBe('Ada kartı yeniden adlandırdı: “Eski” → “Yeni”');
  });

  it('card.renamed → falls back without payload titles', () => {
    expect(summarizeCardActivity({ ...base, type: 'card.renamed', payload: {} }, 'Bir kullanıcı')).toBe(
      'Ada kartı yeniden adlandırdı',
    );
  });

  it('card.archived → distinguishes archive vs restore by payload.archived', () => {
    expect(
      summarizeCardActivity({ ...base, type: 'card.archived', payload: { archived: true } }, 'X'),
    ).toBe('Ada kartı arşivledi');
    expect(
      summarizeCardActivity({ ...base, type: 'card.archived', payload: { archived: false } }, 'X'),
    ).toBe('Ada kartı geri yükledi');
  });

  it('comment.created / checklist.item_checked / checklist.item_unchecked → readable lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'comment.created' }, 'X')).toBe('Ada yorum ekledi');
    expect(summarizeCardActivity({ ...base, type: 'checklist.item_checked' }, 'X')).toBe(
      'Ada bir maddeyi tamamladı',
    );
    expect(summarizeCardActivity({ ...base, type: 'checklist.item_unchecked' }, 'X')).toBe(
      'Ada bir maddenin tamamlanmasını geri aldı',
    );
  });

  it('falls back to the unknown-actor name when the actor was deleted', () => {
    expect(
      summarizeCardActivity({ ...base, actorId: null, actorName: null, type: 'comment.created' }, 'Bir kullanıcı'),
    ).toBe('Bir kullanıcı yorum ekledi');
  });

  it('unknown type → generic line including the type', () => {
    expect(summarizeCardActivity({ ...base, type: 'card.moved' }, 'X')).toBe('Ada bir işlem yaptı (card.moved)');
  });
});
