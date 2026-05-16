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
    expect(
      summarizeCardActivity({ ...base, type: 'card.renamed', payload: {} }, 'Bir kullanıcı'),
    ).toBe('Ada kartı yeniden adlandırdı');
  });

  it('card.archived → distinguishes archive vs restore by payload.archived', () => {
    expect(
      summarizeCardActivity({ ...base, type: 'card.archived', payload: { archived: true } }, 'X'),
    ).toBe('Ada kartı arşivledi');
    expect(
      summarizeCardActivity({ ...base, type: 'card.archived', payload: { archived: false } }, 'X'),
    ).toBe('Ada kartı geri yükledi');
  });

  it('card completion + cover-colour events → readable lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'card.completed' }, 'X')).toBe(
      'Ada kartı tamamlandı olarak işaretledi',
    );
    expect(summarizeCardActivity({ ...base, type: 'card.uncompleted' }, 'X')).toBe(
      'Ada kartın tamamlanmasını geri aldı',
    );
    expect(summarizeCardActivity({ ...base, type: 'card.cover_changed' }, 'X')).toBe(
      'Ada kartın kapak rengini değiştirdi',
    );
    expect(summarizeCardActivity({ ...base, type: 'card.cover_cleared' }, 'X')).toBe(
      'Ada kartın kapak rengini kaldırdı',
    );
    expect(summarizeCardActivity({ ...base, type: 'card.cover_image_changed' }, 'X')).toBe(
      'Ada kartın kapak fotoğrafını değiştirdi',
    );
    expect(summarizeCardActivity({ ...base, type: 'card.cover_image_cleared' }, 'X')).toBe(
      'Ada kartın kapak fotoğrafını kaldırdı',
    );
  });

  it('comment.created / checklist.item_checked / checklist.item_unchecked → readable lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'comment.created' }, 'X')).toBe(
      'Ada yorum ekledi',
    );
    expect(summarizeCardActivity({ ...base, type: 'checklist.item_checked' }, 'X')).toBe(
      'Ada bir maddeyi tamamladı',
    );
    expect(summarizeCardActivity({ ...base, type: 'checklist.item_unchecked' }, 'X')).toBe(
      'Ada bir maddenin tamamlanmasını geri aldı',
    );
  });

  it('board and list events → readable board feed lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'board.created' }, 'X')).toBe(
      'Ada panoyu oluşturdu',
    );
    expect(
      summarizeCardActivity(
        { ...base, type: 'board.renamed', payload: { fromTitle: 'Eski', toTitle: 'Yeni' } },
        'X',
      ),
    ).toBe('Ada panoyu yeniden adlandırdı: “Eski” → “Yeni”');
    expect(
      summarizeCardActivity({ ...base, type: 'list.created', payload: { title: 'Backlog' } }, 'X'),
    ).toBe('Ada liste ekledi: “Backlog”');
    expect(
      summarizeCardActivity({ ...base, type: 'list.archived', payload: { archived: false } }, 'X'),
    ).toBe('Ada listeyi geri yükledi');
  });

  it('falls back to the unknown-actor name when the actor was deleted', () => {
    expect(
      summarizeCardActivity(
        { ...base, actorId: null, actorName: null, type: 'comment.created' },
        'Bir kullanıcı',
      ),
    ).toBe('Bir kullanıcı yorum ekledi');
  });

  it('card.moved / comment.mentioned → readable lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'card.moved' }, 'X')).toBe('Ada kartı taşıdı');
    expect(summarizeCardActivity({ ...base, type: 'comment.mentioned' }, 'X')).toBe(
      'Ada bir yorumda bir kullanıcıdan bahsetti',
    );
  });

  it('attachment events → include the file name when present', () => {
    expect(
      summarizeCardActivity(
        { ...base, type: 'attachment.added', payload: { fileName: 'plan.pdf' } },
        'X',
      ),
    ).toBe('Ada bir dosya ekledi: “plan.pdf”');
    expect(summarizeCardActivity({ ...base, type: 'attachment.added', payload: {} }, 'X')).toBe(
      'Ada bir dosya ekledi',
    );
    expect(
      summarizeCardActivity(
        { ...base, type: 'attachment.removed', payload: { fileName: 'eski.png' } },
        'X',
      ),
    ).toBe('Ada bir dosya kaldırdı: “eski.png”');
  });

  it('board background / list icon events → readable lines', () => {
    expect(summarizeCardActivity({ ...base, type: 'board.background_changed' }, 'X')).toBe(
      'Ada panonun arka planını değiştirdi',
    );
    expect(summarizeCardActivity({ ...base, type: 'board.background_cleared' }, 'X')).toBe(
      'Ada panonun arka planını kaldırdı',
    );
    expect(
      summarizeCardActivity(
        { ...base, type: 'board.updated', payload: { fromIcon: '📋', toIcon: '🚀' } },
        'X',
      ),
    ).toBe('Ada panonun simgesini değiştirdi');
    expect(summarizeCardActivity({ ...base, type: 'list.icon_changed' }, 'X')).toBe(
      'Ada listenin simgesini değiştirdi',
    );
    expect(summarizeCardActivity({ ...base, type: 'list.icon_cleared' }, 'X')).toBe(
      'Ada listenin simgesini kaldırdı',
    );
  });

  it('unknown type → generic Turkish line without the raw type', () => {
    expect(summarizeCardActivity({ ...base, type: 'some.future_event' }, 'X')).toBe(
      'Ada bir işlem yaptı',
    );
  });
});
