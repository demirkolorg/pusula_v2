/**
 * Bildirim sunum yardımcıları (Faz 7K) — bildirim merkezi satırlarının
 * ikon/sistem-bildirimi/özet metin türetmesi.
 *
 * Web `notification-type-icon.tsx` (lucide) + `notification-center.tsx`
 * (`SYSTEM_NOTIFICATION_TYPES`) + `activity-summary.ts` desenlerinin mobil
 * karşılığı. İkonlar Feather'a (mobil `Icon` bileşeni) eşlenir; lucide ile
 * görsel dil tutarlı (Feather lucide'ın atası).
 *
 * Saf modül — RN/Expo importu yok; birim test edilir.
 */
import type { IconName } from '@/components/icon';
import { strings } from '@/lib/strings';

/**
 * Scheduler kaynaklı (aktörsüz) bildirim tipleri — bunları bir kullanıcı
 * tetiklemez, dolayısıyla satırda aktör adı gösterilmez (web
 * `notification-center.tsx` `SYSTEM_NOTIFICATION_TYPES` ile aynı küme). Bkz.
 * `docs/domain/04-bildirim-kurallari.md` → "Sistem (aktörsüz) bildirimler".
 */
const SYSTEM_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'due_approaching',
  'due_overdue',
  'due_reminder_1d',
  'due_reminder_1h',
]);

/** Bildirim sistem (aktörsüz) tipi mi — satırda aktör adı basılmaz. */
export function isSystemNotification(type: string): boolean {
  return SYSTEM_NOTIFICATION_TYPES.has(type);
}

/**
 * Bildirim tipi → Feather ikon adı. Web `notification-type-icon.tsx`'in
 * tip→ikon eşlemesini Feather karşılıklarıyla yansıtır; bilinmeyen tip için
 * genel `message-square`.
 */
export function notificationTypeIcon(type: string): IconName {
  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
    case 'board_member_added':
    case 'board.member_added':
      return 'user-plus';
    case 'mention':
    case 'comment.mentioned':
      return 'at-sign';
    case 'comment_reply':
    case 'comment.created':
    case 'comment_updated':
    case 'comment.updated':
    case 'comment_deleted':
    case 'comment.deleted':
    case 'watched_activity':
      return 'message-square';
    case 'due_approaching':
    case 'due_reminder_1d':
    case 'due_reminder_1h':
    case 'due_overdue':
      return 'clock';
    case 'board_invitation':
    case 'board.member_invited':
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return 'mail';
    case 'card_moved':
    case 'card.moved':
      return 'shuffle';
    case 'card_archived':
    case 'card.archived':
      return 'archive';
    case 'card_completed':
    case 'checklist_item_completed':
    case 'card.completed':
      return 'check-circle';
    case 'card_due_changed':
    case 'card.due_set':
    case 'card.due_cleared':
      return 'calendar';
    case 'card_cover_changed':
    case 'card.cover_changed':
    case 'card.cover_image_changed':
      return 'image';
    case 'card_member_removed':
    case 'card.member_removed':
    case 'member_removed':
      return 'user-minus';
    case 'attachment_added':
    case 'attachment.added':
    case 'attachment_removed':
    case 'attachment.removed':
      return 'paperclip';
    case 'card_renamed':
    case 'card.renamed':
      return 'edit-2';
    case 'card_description_changed':
    case 'card.description_changed':
      return 'align-left';
    case 'card_label_added':
    case 'card.label_added':
    case 'card_label_removed':
    case 'card.label_removed':
      return 'tag';
    case 'checklist_created':
    case 'checklist.created':
    case 'checklist_item_added':
    case 'checklist.item_added':
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return 'check-square';
    case 'member_role_changed':
      return 'shield';
    case 'board_access_requested':
    case 'board.access_requested':
      return 'key';
    default:
      return 'message-square';
  }
}

type NotificationPayloadRecord = Record<string, unknown>;

function payloadText(payload: NotificationPayloadRecord, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cardTitleOf(payload: NotificationPayloadRecord): string {
  return (
    payloadText(payload, 'cardTitle') ??
    payloadText(payload, 'title') ??
    strings.notifications.fallbackCardTitle
  );
}

function boardNameOf(payload: NotificationPayloadRecord): string {
  return payloadText(payload, 'boardName') ?? strings.notifications.fallbackBoardName;
}

/**
 * Bildirim satırının aktör-prefixsiz özet metni — web `activity-summary.ts`'in
 * mobil karşılığı. Satır aktör adını ayrı (kalın) basar; bu metin yeniden
 * kullanılabilir + test edilebilir kalsın diye aktör adını içermez.
 */
export function notificationSummary(type: string, payload: unknown): string {
  const p: NotificationPayloadRecord =
    typeof payload === 'object' && payload !== null
      ? (payload as NotificationPayloadRecord)
      : {};
  const copy = strings.notifications.summary;

  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
      return copy.cardMemberAdded(cardTitleOf(p));
    case 'mention':
    case 'comment.mentioned':
      return copy.commentMentioned(cardTitleOf(p));
    case 'comment_reply':
    case 'comment.created':
      return copy.commentCreated(cardTitleOf(p));
    case 'due_approaching': {
      // DEM-170 — scheduler 1g/1s hatırlatmasının ikisine de `due_approaching`
      // tipini verir; tier-özel metni `reminderTier` payload alanından seç.
      const tier = payloadText(p, 'reminderTier');
      if (tier === 'due_reminder_1h') return copy.dueReminder1h(cardTitleOf(p));
      if (tier === 'due_reminder_1d') return copy.dueReminder1d(cardTitleOf(p));
      return copy.dueApproaching(cardTitleOf(p));
    }
    case 'due_reminder_1d':
      return copy.dueReminder1d(cardTitleOf(p));
    case 'due_reminder_1h':
      return copy.dueReminder1h(cardTitleOf(p));
    case 'due_overdue':
      return copy.dueOverdue(cardTitleOf(p));
    case 'board_invitation':
    case 'board.member_invited':
      return copy.boardMemberInvited(boardNameOf(p));
    case 'board_member_added':
    case 'board.member_added':
      return copy.boardMemberAdded(boardNameOf(p));
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return copy.workspaceMemberInvited(
        payloadText(p, 'workspaceName') ?? strings.notifications.fallbackWorkspaceName,
      );
    case 'board_access_requested':
    case 'board.access_requested':
      return copy.boardAccessRequested(boardNameOf(p));
    case 'card_moved':
    case 'card.moved':
      return copy.cardMoved(cardTitleOf(p));
    case 'card_archived':
    case 'card.archived':
      return copy.cardArchived(cardTitleOf(p));
    case 'card_completed':
    case 'card.completed':
      return payloadText(p, 'activityType') === 'card.uncompleted'
        ? copy.cardUncompleted(cardTitleOf(p))
        : copy.cardCompleted(cardTitleOf(p));
    case 'card_due_changed':
      return payloadText(p, 'activityType') === 'card.due_cleared'
        ? copy.cardDueCleared(cardTitleOf(p))
        : copy.cardDueSet(cardTitleOf(p));
    case 'card_cover_changed':
      return copy.cardCoverChanged(cardTitleOf(p));
    case 'card_member_removed':
    case 'card.member_removed':
      return copy.cardMemberRemoved(cardTitleOf(p));
    case 'member_removed':
      return copy.memberRemoved(boardNameOf(p));
    case 'member_role_changed':
      return copy.memberRoleChanged(boardNameOf(p));
    case 'attachment_added':
    case 'attachment.added':
      return copy.attachmentAdded(cardTitleOf(p));
    case 'attachment_removed':
    case 'attachment.removed':
      return copy.attachmentRemoved(cardTitleOf(p));
    case 'card_renamed':
    case 'card.renamed':
      return copy.cardRenamed(cardTitleOf(p));
    case 'card_description_changed':
    case 'card.description_changed':
      return copy.cardDescriptionChanged(cardTitleOf(p));
    case 'card_label_added':
    case 'card.label_added':
      return copy.cardLabelAdded(cardTitleOf(p));
    case 'card_label_removed':
    case 'card.label_removed':
      return copy.cardLabelRemoved(cardTitleOf(p));
    case 'comment_updated':
    case 'comment.updated':
      return copy.commentUpdated(cardTitleOf(p));
    case 'comment_deleted':
    case 'comment.deleted':
      return copy.commentDeleted(cardTitleOf(p));
    case 'checklist_created':
    case 'checklist.created':
      return copy.checklistCreated(cardTitleOf(p));
    case 'checklist_item_added':
    case 'checklist.item_added':
      return copy.checklistItemAdded(cardTitleOf(p));
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return copy.checklistItemRemoved(cardTitleOf(p));
    case 'checklist_item_completed':
      return copy.checklistItemCompleted(cardTitleOf(p));
    case 'watched_activity':
      return copy.watchedActivity(cardTitleOf(p));
    default:
      return copy.default;
  }
}

/** Bildirim payload'ından aktör adını okur (yoksa `null`). */
export function notificationActorName(payload: unknown): string | null {
  const p: NotificationPayloadRecord =
    typeof payload === 'object' && payload !== null
      ? (payload as NotificationPayloadRecord)
      : {};
  return payloadText(p, 'actorName') ?? null;
}
