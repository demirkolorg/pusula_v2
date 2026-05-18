import { describe, expect, it } from 'vitest';
import {
  isSystemNotification,
  notificationActorName,
  notificationSummary,
  notificationTypeIcon,
} from '@/lib/notification-display';
import { strings } from '@/lib/strings';

/**
 * `notification-display.ts` birim testleri (Faz 7K + 7N coverage genişletme) —
 * bildirim satırı sunum türetmesi (ikon / sistem-bildirimi / özet metin / aktör
 * adı). Beklenen değerler `strings.notifications` sabitleriyle eşlenir
 * (tautoloji değil — modülün gerçek çıktısı doğrulanır).
 */
const copy = strings.notifications.summary;
const fallbackCard = strings.notifications.fallbackCardTitle;
const fallbackBoard = strings.notifications.fallbackBoardName;
const fallbackWorkspace = strings.notifications.fallbackWorkspaceName;

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

  it('bilinmeyen / boş tip sistem bildirimi değildir', () => {
    expect(isSystemNotification('hic_olmayan_tip')).toBe(false);
    expect(isSystemNotification('')).toBe(false);
  });
});

describe('notificationTypeIcon', () => {
  it('user-plus: kart/board üye ekleme tipleri', () => {
    expect(notificationTypeIcon('card_assigned')).toBe('user-plus');
    expect(notificationTypeIcon('card.member_added')).toBe('user-plus');
    expect(notificationTypeIcon('board_member_added')).toBe('user-plus');
    expect(notificationTypeIcon('board.member_added')).toBe('user-plus');
  });

  it('at-sign: mention / yorum bahsetme tipleri', () => {
    expect(notificationTypeIcon('mention')).toBe('at-sign');
    expect(notificationTypeIcon('comment.mentioned')).toBe('at-sign');
  });

  it('message-square: yorum ve izlenen aktivite tipleri', () => {
    expect(notificationTypeIcon('comment_reply')).toBe('message-square');
    expect(notificationTypeIcon('comment.created')).toBe('message-square');
    expect(notificationTypeIcon('comment_updated')).toBe('message-square');
    expect(notificationTypeIcon('comment.updated')).toBe('message-square');
    expect(notificationTypeIcon('comment_deleted')).toBe('message-square');
    expect(notificationTypeIcon('comment.deleted')).toBe('message-square');
    expect(notificationTypeIcon('watched_activity')).toBe('message-square');
  });

  it('clock: teslim tarihi tipleri', () => {
    expect(notificationTypeIcon('due_approaching')).toBe('clock');
    expect(notificationTypeIcon('due_reminder_1d')).toBe('clock');
    expect(notificationTypeIcon('due_reminder_1h')).toBe('clock');
    expect(notificationTypeIcon('due_overdue')).toBe('clock');
  });

  it('mail: davet tipleri', () => {
    expect(notificationTypeIcon('board_invitation')).toBe('mail');
    expect(notificationTypeIcon('board.member_invited')).toBe('mail');
    expect(notificationTypeIcon('workspace_invitation')).toBe('mail');
    expect(notificationTypeIcon('workspace.member_invited')).toBe('mail');
  });

  it('shuffle: kart taşıma tipleri', () => {
    expect(notificationTypeIcon('card_moved')).toBe('shuffle');
    expect(notificationTypeIcon('card.moved')).toBe('shuffle');
  });

  it('archive: kart arşivleme tipleri', () => {
    expect(notificationTypeIcon('card_archived')).toBe('archive');
    expect(notificationTypeIcon('card.archived')).toBe('archive');
  });

  it('check-circle: kart/madde tamamlama tipleri', () => {
    expect(notificationTypeIcon('card_completed')).toBe('check-circle');
    expect(notificationTypeIcon('checklist_item_completed')).toBe('check-circle');
    expect(notificationTypeIcon('card.completed')).toBe('check-circle');
  });

  it('calendar: teslim tarihi değişim tipleri', () => {
    expect(notificationTypeIcon('card_due_changed')).toBe('calendar');
    expect(notificationTypeIcon('card.due_set')).toBe('calendar');
    expect(notificationTypeIcon('card.due_cleared')).toBe('calendar');
  });

  it('image: kart kapağı değişim tipleri', () => {
    expect(notificationTypeIcon('card_cover_changed')).toBe('image');
    expect(notificationTypeIcon('card.cover_changed')).toBe('image');
    expect(notificationTypeIcon('card.cover_image_changed')).toBe('image');
  });

  it('user-minus: üye çıkarma tipleri', () => {
    expect(notificationTypeIcon('card_member_removed')).toBe('user-minus');
    expect(notificationTypeIcon('card.member_removed')).toBe('user-minus');
    expect(notificationTypeIcon('member_removed')).toBe('user-minus');
  });

  it('paperclip: dosya ekleme/kaldırma tipleri', () => {
    expect(notificationTypeIcon('attachment_added')).toBe('paperclip');
    expect(notificationTypeIcon('attachment.added')).toBe('paperclip');
    expect(notificationTypeIcon('attachment_removed')).toBe('paperclip');
    expect(notificationTypeIcon('attachment.removed')).toBe('paperclip');
  });

  it('edit-2: kart yeniden adlandırma tipleri', () => {
    expect(notificationTypeIcon('card_renamed')).toBe('edit-2');
    expect(notificationTypeIcon('card.renamed')).toBe('edit-2');
  });

  it('align-left: kart açıklama değişim tipleri', () => {
    expect(notificationTypeIcon('card_description_changed')).toBe('align-left');
    expect(notificationTypeIcon('card.description_changed')).toBe('align-left');
  });

  it('tag: etiket ekleme/kaldırma tipleri', () => {
    expect(notificationTypeIcon('card_label_added')).toBe('tag');
    expect(notificationTypeIcon('card.label_added')).toBe('tag');
    expect(notificationTypeIcon('card_label_removed')).toBe('tag');
    expect(notificationTypeIcon('card.label_removed')).toBe('tag');
  });

  it('check-square: yapılacaklar listesi/madde tipleri', () => {
    expect(notificationTypeIcon('checklist_created')).toBe('check-square');
    expect(notificationTypeIcon('checklist.created')).toBe('check-square');
    expect(notificationTypeIcon('checklist_item_added')).toBe('check-square');
    expect(notificationTypeIcon('checklist.item_added')).toBe('check-square');
    expect(notificationTypeIcon('checklist_item_removed')).toBe('check-square');
    expect(notificationTypeIcon('checklist.item_removed')).toBe('check-square');
  });

  it('shield: rol değişimi tipi', () => {
    expect(notificationTypeIcon('member_role_changed')).toBe('shield');
  });

  it('key: erişim isteği tipleri', () => {
    expect(notificationTypeIcon('board_access_requested')).toBe('key');
    expect(notificationTypeIcon('board.access_requested')).toBe('key');
  });

  it('bilinmeyen / boş tip için genel ikon döner', () => {
    expect(notificationTypeIcon('hic_olmayan_tip')).toBe('message-square');
    expect(notificationTypeIcon('')).toBe('message-square');
  });
});

describe('notificationSummary', () => {
  it('kart atama özetinde kart başlığını kullanır', () => {
    expect(notificationSummary('card_assigned', { cardTitle: 'Sprint planı' })).toBe(
      copy.cardMemberAdded('Sprint planı'),
    );
    expect(notificationSummary('card.member_added', { cardTitle: 'Sprint planı' })).toBe(
      copy.cardMemberAdded('Sprint planı'),
    );
  });

  it('mention / yorum bahsetme özeti', () => {
    expect(notificationSummary('mention', { cardTitle: 'A' })).toBe(copy.commentMentioned('A'));
    expect(notificationSummary('comment.mentioned', { cardTitle: 'A' })).toBe(
      copy.commentMentioned('A'),
    );
  });

  it('yorum oluşturma özeti', () => {
    expect(notificationSummary('comment_reply', { cardTitle: 'A' })).toBe(copy.commentCreated('A'));
    expect(notificationSummary('comment.created', { cardTitle: 'A' })).toBe(
      copy.commentCreated('A'),
    );
  });

  it('due_approaching reminderTier alanına göre metni seçer', () => {
    expect(
      notificationSummary('due_approaching', { cardTitle: 'X', reminderTier: 'due_reminder_1h' }),
    ).toBe(copy.dueReminder1h('X'));
    expect(
      notificationSummary('due_approaching', { cardTitle: 'X', reminderTier: 'due_reminder_1d' }),
    ).toBe(copy.dueReminder1d('X'));
  });

  it('due_approaching reminderTier yoksa genel yaklaşıyor metni', () => {
    expect(notificationSummary('due_approaching', { cardTitle: 'X' })).toBe(
      copy.dueApproaching('X'),
    );
    expect(
      notificationSummary('due_approaching', { cardTitle: 'X', reminderTier: 'bilinmeyen' }),
    ).toBe(copy.dueApproaching('X'));
  });

  it('due_reminder_1d / due_reminder_1h / due_overdue özetleri', () => {
    expect(notificationSummary('due_reminder_1d', { cardTitle: 'X' })).toBe(copy.dueReminder1d('X'));
    expect(notificationSummary('due_reminder_1h', { cardTitle: 'X' })).toBe(copy.dueReminder1h('X'));
    expect(notificationSummary('due_overdue', { cardTitle: 'X' })).toBe(copy.dueOverdue('X'));
  });

  it('board davet / ekleme özetleri board adını kullanır', () => {
    expect(notificationSummary('board_invitation', { boardName: 'Pano A' })).toBe(
      copy.boardMemberInvited('Pano A'),
    );
    expect(notificationSummary('board.member_invited', { boardName: 'Pano A' })).toBe(
      copy.boardMemberInvited('Pano A'),
    );
    expect(notificationSummary('board_member_added', { boardName: 'Pano A' })).toBe(
      copy.boardMemberAdded('Pano A'),
    );
    expect(notificationSummary('board.member_added', { boardName: 'Pano A' })).toBe(
      copy.boardMemberAdded('Pano A'),
    );
  });

  it('workspace davet özeti workspace adını kullanır', () => {
    expect(notificationSummary('workspace_invitation', { workspaceName: 'WS' })).toBe(
      copy.workspaceMemberInvited('WS'),
    );
    expect(notificationSummary('workspace.member_invited', { workspaceName: 'WS' })).toBe(
      copy.workspaceMemberInvited('WS'),
    );
  });

  it('workspace davet workspace adı yoksa yedek kullanır', () => {
    expect(notificationSummary('workspace_invitation', {})).toBe(
      copy.workspaceMemberInvited(fallbackWorkspace),
    );
  });

  it('board erişim isteği özeti', () => {
    expect(notificationSummary('board_access_requested', { boardName: 'Pano A' })).toBe(
      copy.boardAccessRequested('Pano A'),
    );
    expect(notificationSummary('board.access_requested', { boardName: 'Pano A' })).toBe(
      copy.boardAccessRequested('Pano A'),
    );
  });

  it('kart taşıma / arşivleme özetleri', () => {
    expect(notificationSummary('card_moved', { cardTitle: 'X' })).toBe(copy.cardMoved('X'));
    expect(notificationSummary('card.moved', { cardTitle: 'X' })).toBe(copy.cardMoved('X'));
    expect(notificationSummary('card_archived', { cardTitle: 'X' })).toBe(copy.cardArchived('X'));
    expect(notificationSummary('card.archived', { cardTitle: 'X' })).toBe(copy.cardArchived('X'));
  });

  it('kart tamamlama: activityType ile completed/uncompleted ayrımı', () => {
    expect(notificationSummary('card_completed', { cardTitle: 'X' })).toBe(copy.cardCompleted('X'));
    expect(notificationSummary('card.completed', { cardTitle: 'X' })).toBe(copy.cardCompleted('X'));
    expect(
      notificationSummary('card_completed', { cardTitle: 'X', activityType: 'card.uncompleted' }),
    ).toBe(copy.cardUncompleted('X'));
  });

  it('kart teslim tarihi: activityType ile set/cleared ayrımı', () => {
    expect(notificationSummary('card_due_changed', { cardTitle: 'X' })).toBe(copy.cardDueSet('X'));
    expect(
      notificationSummary('card_due_changed', { cardTitle: 'X', activityType: 'card.due_cleared' }),
    ).toBe(copy.cardDueCleared('X'));
  });

  it('kart kapak değişimi özeti', () => {
    expect(notificationSummary('card_cover_changed', { cardTitle: 'X' })).toBe(
      copy.cardCoverChanged('X'),
    );
  });

  it('kart / board üye çıkarma özetleri', () => {
    expect(notificationSummary('card_member_removed', { cardTitle: 'X' })).toBe(
      copy.cardMemberRemoved('X'),
    );
    expect(notificationSummary('card.member_removed', { cardTitle: 'X' })).toBe(
      copy.cardMemberRemoved('X'),
    );
    expect(notificationSummary('member_removed', { boardName: 'Pano A' })).toBe(
      copy.memberRemoved('Pano A'),
    );
  });

  it('rol değişimi özeti board adını kullanır', () => {
    expect(notificationSummary('member_role_changed', { boardName: 'Pano A' })).toBe(
      copy.memberRoleChanged('Pano A'),
    );
  });

  it('dosya ekleme / kaldırma özetleri', () => {
    expect(notificationSummary('attachment_added', { cardTitle: 'X' })).toBe(
      copy.attachmentAdded('X'),
    );
    expect(notificationSummary('attachment.added', { cardTitle: 'X' })).toBe(
      copy.attachmentAdded('X'),
    );
    expect(notificationSummary('attachment_removed', { cardTitle: 'X' })).toBe(
      copy.attachmentRemoved('X'),
    );
    expect(notificationSummary('attachment.removed', { cardTitle: 'X' })).toBe(
      copy.attachmentRemoved('X'),
    );
  });

  it('kart yeniden adlandırma / açıklama değişim özetleri', () => {
    expect(notificationSummary('card_renamed', { cardTitle: 'X' })).toBe(copy.cardRenamed('X'));
    expect(notificationSummary('card.renamed', { cardTitle: 'X' })).toBe(copy.cardRenamed('X'));
    expect(notificationSummary('card_description_changed', { cardTitle: 'X' })).toBe(
      copy.cardDescriptionChanged('X'),
    );
    expect(notificationSummary('card.description_changed', { cardTitle: 'X' })).toBe(
      copy.cardDescriptionChanged('X'),
    );
  });

  it('etiket ekleme / kaldırma özetleri', () => {
    expect(notificationSummary('card_label_added', { cardTitle: 'X' })).toBe(
      copy.cardLabelAdded('X'),
    );
    expect(notificationSummary('card.label_added', { cardTitle: 'X' })).toBe(
      copy.cardLabelAdded('X'),
    );
    expect(notificationSummary('card_label_removed', { cardTitle: 'X' })).toBe(
      copy.cardLabelRemoved('X'),
    );
    expect(notificationSummary('card.label_removed', { cardTitle: 'X' })).toBe(
      copy.cardLabelRemoved('X'),
    );
  });

  it('yorum düzenleme / silme özetleri', () => {
    expect(notificationSummary('comment_updated', { cardTitle: 'X' })).toBe(
      copy.commentUpdated('X'),
    );
    expect(notificationSummary('comment.updated', { cardTitle: 'X' })).toBe(
      copy.commentUpdated('X'),
    );
    expect(notificationSummary('comment_deleted', { cardTitle: 'X' })).toBe(
      copy.commentDeleted('X'),
    );
    expect(notificationSummary('comment.deleted', { cardTitle: 'X' })).toBe(
      copy.commentDeleted('X'),
    );
  });

  it('yapılacaklar listesi / madde özetleri', () => {
    expect(notificationSummary('checklist_created', { cardTitle: 'X' })).toBe(
      copy.checklistCreated('X'),
    );
    expect(notificationSummary('checklist.created', { cardTitle: 'X' })).toBe(
      copy.checklistCreated('X'),
    );
    expect(notificationSummary('checklist_item_added', { cardTitle: 'X' })).toBe(
      copy.checklistItemAdded('X'),
    );
    expect(notificationSummary('checklist.item_added', { cardTitle: 'X' })).toBe(
      copy.checklistItemAdded('X'),
    );
    expect(notificationSummary('checklist_item_removed', { cardTitle: 'X' })).toBe(
      copy.checklistItemRemoved('X'),
    );
    expect(notificationSummary('checklist.item_removed', { cardTitle: 'X' })).toBe(
      copy.checklistItemRemoved('X'),
    );
    expect(notificationSummary('checklist_item_completed', { cardTitle: 'X' })).toBe(
      copy.checklistItemCompleted('X'),
    );
  });

  it('izlenen aktivite özeti', () => {
    expect(notificationSummary('watched_activity', { cardTitle: 'X' })).toBe(
      copy.watchedActivity('X'),
    );
  });

  it('cardTitle yoksa title alanına düşer', () => {
    expect(notificationSummary('card_moved', { title: 'Yedek başlık' })).toBe(
      copy.cardMoved('Yedek başlık'),
    );
  });

  it('kart başlığı yoksa yedek metin kullanılır', () => {
    expect(notificationSummary('mention', {})).toBe(copy.commentMentioned(fallbackCard));
  });

  it('board adı yoksa yedek pano metni kullanılır', () => {
    expect(notificationSummary('board_member_added', {})).toBe(
      copy.boardMemberAdded(fallbackBoard),
    );
  });

  it('boş/boşluklu string alanları yok sayıp yedeğe düşer', () => {
    expect(notificationSummary('card_moved', { cardTitle: '   ' })).toBe(
      copy.cardMoved(fallbackCard),
    );
    expect(notificationSummary('card_moved', { cardTitle: 42 })).toBe(copy.cardMoved(fallbackCard));
  });

  it('bilinmeyen tip için genel özet döner', () => {
    expect(notificationSummary('hic_olmayan_tip', {})).toBe(copy.default);
    expect(notificationSummary('', {})).toBe(copy.default);
  });

  it('payload nesne değilse güvenle yedek özet üretir', () => {
    expect(notificationSummary('mention', null)).toBe(copy.commentMentioned(fallbackCard));
    expect(notificationSummary('mention', undefined)).toBe(copy.commentMentioned(fallbackCard));
    expect(notificationSummary('mention', 'string-payload')).toBe(
      copy.commentMentioned(fallbackCard),
    );
    expect(notificationSummary('mention', 123)).toBe(copy.commentMentioned(fallbackCard));
  });
});

describe('notificationActorName', () => {
  it('payloaddaki aktör adını döner', () => {
    expect(notificationActorName({ actorName: 'Ayşe' })).toBe('Ayşe');
  });

  it('aktör adının baş/son boşluğunu kırpar', () => {
    expect(notificationActorName({ actorName: '  Mehmet  ' })).toBe('Mehmet');
  });

  it('aktör adı yoksa null döner', () => {
    expect(notificationActorName({})).toBeNull();
    expect(notificationActorName(null)).toBeNull();
    expect(notificationActorName(undefined)).toBeNull();
  });

  it('boş/boşluklu aktör adını yok sayar', () => {
    expect(notificationActorName({ actorName: '   ' })).toBeNull();
    expect(notificationActorName({ actorName: '' })).toBeNull();
  });

  it('aktör adı string değilse null döner', () => {
    expect(notificationActorName({ actorName: 42 })).toBeNull();
    expect(notificationActorName({ actorName: { name: 'x' } })).toBeNull();
    expect(notificationActorName('string-payload')).toBeNull();
  });
});
