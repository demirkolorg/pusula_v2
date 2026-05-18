import { describe, expect, it } from 'vitest';
import {
  isSystemNotification,
  notificationActorName,
  notificationSummary,
  notificationTypeIcon,
} from '@/lib/notification-display';

/**
 * `notification-display.ts` birim testleri (Faz 7K) — bildirim satırı sunum
 * türetmesi (ikon / sistem-bildirimi / özet metin / aktör adı).
 */
describe('isSystemNotification', () => {
  it('due_* tipleri sistem (aktörsüz) bildirimdir', () => {
    expect(isSystemNotification('due_approaching')).toBe(true);
    expect(isSystemNotification('due_overdue')).toBe(true);
    expect(isSystemNotification('due_reminder_1d')).toBe(true);
    expect(isSystemNotification('due_reminder_1h')).toBe(true);
  });

  it('aktör tetikli tipler sistem bildirimi değildir', () => {
    expect(isSystemNotification('mention')).toBe(false);
    expect(isSystemNotification('card_assigned')).toBe(false);
    expect(isSystemNotification('comment_reply')).toBe(false);
  });
});

describe('notificationTypeIcon', () => {
  it('bilinen tipleri ilgili Feather ikonuna eşler', () => {
    expect(notificationTypeIcon('mention')).toBe('at-sign');
    expect(notificationTypeIcon('card_assigned')).toBe('user-plus');
    expect(notificationTypeIcon('due_overdue')).toBe('clock');
    expect(notificationTypeIcon('board_invitation')).toBe('mail');
    expect(notificationTypeIcon('attachment_added')).toBe('paperclip');
  });

  it('bilinmeyen tip için genel ikon döner', () => {
    expect(notificationTypeIcon('hic_olmayan_tip')).toBe('message-square');
  });
});

describe('notificationSummary', () => {
  it('kart atama özetinde kart başlığını kullanır', () => {
    expect(notificationSummary('card_assigned', { cardTitle: 'Sprint planı' })).toContain(
      'Sprint planı',
    );
  });

  it('due_approaching reminderTier alanına göre metni seçer', () => {
    expect(
      notificationSummary('due_approaching', {
        cardTitle: 'X',
        reminderTier: 'due_reminder_1h',
      }),
    ).toContain('1 saat');
    expect(
      notificationSummary('due_approaching', {
        cardTitle: 'X',
        reminderTier: 'due_reminder_1d',
      }),
    ).toContain('yarın');
  });

  it('kart başlığı yoksa yedek metin kullanılır', () => {
    expect(notificationSummary('mention', {})).toContain('bu kart');
  });

  it('bilinmeyen tip için genel özet döner', () => {
    expect(notificationSummary('hic_olmayan_tip', {})).toBe('bir işlem yaptı');
  });

  it('payload nesne değilse güvenle yedek özet üretir', () => {
    expect(notificationSummary('mention', null)).toContain('bu kart');
  });
});

describe('notificationActorName', () => {
  it('payloaddaki aktör adını döner', () => {
    expect(notificationActorName({ actorName: 'Ayşe' })).toBe('Ayşe');
  });

  it('aktör adı yoksa null döner', () => {
    expect(notificationActorName({})).toBeNull();
    expect(notificationActorName(null)).toBeNull();
  });

  it('boş/boşluklu aktör adını yok sayar', () => {
    expect(notificationActorName({ actorName: '   ' })).toBeNull();
  });
});
