import { describe, expect, it } from 'vitest';
import { cardRefreshTargets, notificationRefreshScope } from '@/lib/notification-refresh';

/**
 * `notification-refresh.ts` birim testleri (DEM-219) — foreground push
 * payload'ından tazelenecek board/kart kapsamının çıkarımı.
 */
describe('notificationRefreshScope', () => {
  it('kart + board taşıyan payload her iki kimliği döndürür', () => {
    expect(
      notificationRefreshScope({ type: 'card_member_added', cardId: 'c-1', boardId: 'b-1' }),
    ).toEqual({ boardId: 'b-1', cardId: 'c-1' });
  });

  it('yalnız board taşıyan payload kartı null döndürür', () => {
    expect(
      notificationRefreshScope({ type: 'board_member_added', boardId: 'b-2' }),
    ).toEqual({ boardId: 'b-2', cardId: null });
  });

  it('yalnız kart taşıyan payload board kimliğini null döndürür', () => {
    expect(notificationRefreshScope({ type: 'comment_added', cardId: 'c-3' })).toEqual({
      boardId: null,
      cardId: 'c-3',
    });
  });

  it('boş payload her iki kimliği null döndürür', () => {
    expect(notificationRefreshScope({})).toEqual({ boardId: null, cardId: null });
  });

  it('null payload güvenle null kimlikler döndürür', () => {
    expect(notificationRefreshScope(null)).toEqual({ boardId: null, cardId: null });
  });

  it('undefined payload güvenle null kimlikler döndürür', () => {
    expect(notificationRefreshScope(undefined)).toEqual({ boardId: null, cardId: null });
  });

  it('nesne olmayan (string) payload güvenle null kimlikler döndürür', () => {
    expect(notificationRefreshScope('bozuk')).toEqual({ boardId: null, cardId: null });
  });

  it('boş-string kimlikler null olarak normalize edilir', () => {
    expect(notificationRefreshScope({ cardId: '', boardId: '' })).toEqual({
      boardId: null,
      cardId: null,
    });
  });

  it('yalnız boşluktan oluşan kimlikler null olarak normalize edilir', () => {
    expect(notificationRefreshScope({ cardId: '   ', boardId: '\t' })).toEqual({
      boardId: null,
      cardId: null,
    });
  });

  it('string olmayan kimlik değerleri (number/boolean) null döndürür', () => {
    expect(notificationRefreshScope({ cardId: 123, boardId: true })).toEqual({
      boardId: null,
      cardId: null,
    });
  });

  it('kimlikler kırpılarak döndürülür', () => {
    expect(notificationRefreshScope({ cardId: '  c-4  ', boardId: ' b-4 ' })).toEqual({
      boardId: 'b-4',
      cardId: 'c-4',
    });
  });
});

/**
 * `cardRefreshTargets` birim testleri (DEM-229) — foreground push'un bildirim
 * tipinden açık kart detayının hangi alt sorgularının tazeleneceğinin çıkarımı.
 * `activity` her kart bildiriminde tazelenir; geri kalanı tipe daraltılır.
 */
describe('cardRefreshTargets', () => {
  const ALL = ['card', 'labels', 'members', 'comment', 'checklist', 'activity'];

  it('yorum tipi yalnız comment + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'comment_reply', cardId: 'c-1' })).toEqual([
      'comment',
      'activity',
    ]);
  });

  it('mention tipi yalnız comment + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'mention' })).toEqual(['comment', 'activity']);
  });

  it('atama tipi yalnız members + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'card_assigned' })).toEqual(['members', 'activity']);
  });

  it('etiket tipi yalnız labels + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'card_label_added' })).toEqual(['labels', 'activity']);
  });

  it('checklist tipi yalnız checklist + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'checklist_item_completed' })).toEqual([
      'checklist',
      'activity',
    ]);
  });

  it('kart-alanı tipi (yeniden adlandırma) yalnız card + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'card_renamed' })).toEqual(['card', 'activity']);
  });

  it('teslim tarihi tipi yalnız card + activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'due_approaching' })).toEqual(['card', 'activity']);
  });

  it('ek tipi yalnız activity döndürür', () => {
    expect(cardRefreshTargets({ type: 'attachment_added' })).toEqual(['activity']);
  });

  it('bilinmeyen tip için tam fallback döndürür', () => {
    expect(cardRefreshTargets({ type: 'watched_activity' })).toEqual(ALL);
  });

  it('tip taşımayan payload için tam fallback döndürür', () => {
    expect(cardRefreshTargets({ cardId: 'c-1' })).toEqual(ALL);
  });

  it('boş tip için tam fallback döndürür', () => {
    expect(cardRefreshTargets({ type: '' })).toEqual(ALL);
  });

  it('string olmayan tip için tam fallback döndürür', () => {
    expect(cardRefreshTargets({ type: 123 })).toEqual(ALL);
  });

  it('null payload için tam fallback döndürür', () => {
    expect(cardRefreshTargets(null)).toEqual(ALL);
  });

  it('nesne olmayan payload için tam fallback döndürür', () => {
    expect(cardRefreshTargets('bozuk')).toEqual(ALL);
  });
});
