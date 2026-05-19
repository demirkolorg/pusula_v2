import { describe, expect, it } from 'vitest';
import { notificationRefreshScope } from '@/lib/notification-refresh';

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
