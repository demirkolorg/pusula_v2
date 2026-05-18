import { describe, expect, it } from 'vitest';
import { notificationTarget } from '@/lib/notification-target';

/**
 * `notification-target.ts` birim testleri (Faz 7K) — bildirim satırının
 * Expo Router hedefine deterministik çevrimi.
 */
describe('notificationTarget', () => {
  it('kart + board olduğunda kart detayına yönlendirir', () => {
    const target = notificationTarget({
      workspaceId: 'ws-1',
      boardId: 'b-1',
      cardId: 'c-1',
      payload: { cardTitle: 'Sprint planı' },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-1', title: 'Sprint planı' },
    });
  });

  it('kart başlığı yoksa boş başlıkla kart detayına gider', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: 'b-1',
      cardId: 'c-1',
      payload: {},
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-1', title: '' },
    });
  });

  it('board var kart yoksa board ekranına yönlendirir', () => {
    const target = notificationTarget({
      workspaceId: 'ws-1',
      boardId: 'b-1',
      cardId: null,
      payload: { boardName: 'Tasarım' },
    });
    expect(target).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-1', title: 'Tasarım' },
    });
  });

  it('board başlığı payload `boardTitle` alanından da okunur', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: 'b-2',
      cardId: null,
      payload: { boardTitle: 'Pazarlama' },
    });
    expect(target).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-2', title: 'Pazarlama' },
    });
  });

  it('yalnız workspace varsa workspace ekranına yönlendirir', () => {
    const target = notificationTarget({
      workspaceId: 'ws-9',
      boardId: null,
      cardId: null,
      payload: { workspaceName: 'Ekip Alanı' },
    });
    expect(target).toEqual({
      pathname: '/workspaces/[id]',
      params: { id: 'ws-9', name: 'Ekip Alanı' },
    });
  });

  it('üst-seviye id boşsa payload içindeki id yedek olarak kullanılır', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: { cardId: 'c-7', boardId: 'b-7', workspaceId: 'ws-7', cardTitle: 'X' },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-7', title: 'X' },
    });
  });

  it('hedef türetilemezse null döner', () => {
    expect(
      notificationTarget({ workspaceId: null, boardId: null, cardId: null, payload: {} }),
    ).toBeNull();
  });

  it('payload nesne değilse güvenle null döner', () => {
    expect(
      notificationTarget({ workspaceId: null, boardId: null, cardId: null, payload: 'bozuk' }),
    ).toBeNull();
  });

  it('push data (type+cardId+boardId) kart detayına çözülür (Faz 7L)', () => {
    // Worker push payload'ı `data: { type, cardId?, boardId? }` taşır;
    // `use-notification-deep-link` üst-seviye id'leri null verip payload'a koyar.
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: { type: 'card_member_added', cardId: 'c-5', boardId: 'b-5' },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-5', title: '' },
    });
  });

  it('push data yalnız boardId taşıyorsa board ekranına çözülür (Faz 7L)', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: { type: 'board_member_added', boardId: 'b-6' },
    });
    expect(target).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-6', title: '' },
    });
  });

  it('kart payloadda olsa board yoksa board hedefi üretilmez (kart detayına da gitmez)', () => {
    // `cardId` var ama `boardId` yok → kart detayı koşulu (cardId && boardId)
    // sağlanmaz; workspace de yoksa hedef null.
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: 'c-1',
      payload: {},
    });
    expect(target).toBeNull();
  });
});
