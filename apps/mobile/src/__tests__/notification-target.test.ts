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

  it('madde yorum payloadı (checklistItemId) kart hedefine taşınır', () => {
    // Bir kontrol listesi maddesi yorum bildirimi push'unda `checklistItemId`
    // varsa kart açılınca o maddenin thread'i açılsın diye param'a taşınır.
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: {
        type: 'comment_created',
        cardId: 'c-8',
        boardId: 'b-8',
        checklistItemId: 'ci-3',
        cardTitle: 'Sprint',
      },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-8', title: 'Sprint', checklistItemId: 'ci-3' },
    });
  });

  it('checklistItemId yoksa kart hedefi alanı taşımaz (kart-seviyesi)', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: { type: 'comment_created', cardId: 'c-9', boardId: 'b-9' },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-9', title: '' },
    });
    // `checklistItemId` alanı hiç var olmamalı (undefined değil, eksik).
    expect(target && 'checklistItemId' in target.params).toBe(false);
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

  // ─── Faz 13S (DEM-275) — saved-report varyantı ─────────────────────────

  it('savedReportId + workspaceId payloadda varsa saved-report ekranına yönlendirir (Faz 13S)', () => {
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: {
        type: 'report_scheduled_ready',
        savedReportId: 's-1',
        workspaceId: 'ws-1',
        reportTitle: 'Sprint Sağlık',
      },
    });
    expect(target).toEqual({
      pathname: '/saved-reports/[id]',
      params: { id: 's-1', workspaceId: 'ws-1', title: 'Sprint Sağlık' },
    });
  });

  it('savedReportId varsa rapor başlığı boş gelse de saved-report hedefi üretilir', () => {
    const target = notificationTarget({
      workspaceId: 'ws-1', // üst-seviye olarak da gelebilir
      boardId: null,
      cardId: null,
      payload: { savedReportId: 's-2' },
    });
    expect(target).toEqual({
      pathname: '/saved-reports/[id]',
      params: { id: 's-2', workspaceId: 'ws-1', title: '' },
    });
  });

  it('savedReportId var ama workspaceId yoksa target null döner (defansif)', () => {
    // Production'da bu durum olmaz — worker payload ikisini de yazar.
    // Defansif: kullanıcı uygulamada bir şey yapamaz, hedef null.
    const target = notificationTarget({
      workspaceId: null,
      boardId: null,
      cardId: null,
      payload: { savedReportId: 's-3' },
    });
    expect(target).toBeNull();
  });

  it('savedReportId + kart/board id taşıyorsa rapor önceliği yoktur (kart kazanır)', () => {
    // Mevcut sıra: cardId+boardId → saved-report → workspace. Kart bağlamı
    // varsa o gösterilir (rapor bildirimi push'unda kart id'leri olmaz; defansif).
    const target = notificationTarget({
      workspaceId: 'ws-1',
      boardId: 'b-1',
      cardId: 'c-1',
      payload: { savedReportId: 's-1', cardTitle: 'X' },
    });
    expect(target).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-1', title: 'X' },
    });
  });
});
