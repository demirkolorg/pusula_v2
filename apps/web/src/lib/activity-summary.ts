import { strings } from './strings';

type ActivityPayload = Record<string, unknown>;

function text(payload: ActivityPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cardTitle(payload: ActivityPayload): string {
  return (
    text(payload, 'cardTitle') ?? text(payload, 'title') ?? strings.notifications.fallbackCardTitle
  );
}

function boardName(payload: ActivityPayload): string {
  return text(payload, 'boardName') ?? strings.notifications.fallbackBoardName;
}

/**
 * Notification summary copy without the actor prefix. Notification rows render
 * the actor separately so the name can stay bold while the action text remains
 * reusable and testable.
 */
export function activitySummary(type: string, payload: unknown): string {
  const p = typeof payload === 'object' && payload !== null ? (payload as ActivityPayload) : {};
  const copy = strings.notifications.summary;

  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
      return copy.cardMemberAdded(cardTitle(p));
    case 'mention':
    case 'comment.mentioned':
      return copy.commentMentioned(cardTitle(p));
    case 'comment_reply':
    case 'comment.created':
      return copy.commentCreated(cardTitle(p));
    case 'due_approaching': {
      // DEM-170 — scheduler 1g/1s hatırlatmasının ikisine de `due_approaching`
      // tipini verir; tier-özel metni `reminderTier` payload alanından seç.
      const tier = text(p, 'reminderTier');
      if (tier === 'due_reminder_1h') return copy.dueReminder1h(cardTitle(p));
      if (tier === 'due_reminder_1d') return copy.dueReminder1d(cardTitle(p));
      return copy.dueApproaching(cardTitle(p));
    }
    case 'due_reminder_1d':
      return copy.dueReminder1d(cardTitle(p));
    case 'due_reminder_1h':
      return copy.dueReminder1h(cardTitle(p));
    case 'due_overdue':
      return copy.dueOverdue(cardTitle(p));
    case 'board_invitation':
    case 'board.member_invited':
      return copy.boardMemberInvited(boardName(p));
    // DEM-175 — board'a doğrudan eklenme: "davet etti" değil "ekledi".
    case 'board_member_added':
    case 'board.member_added':
      return copy.boardMemberAdded(boardName(p));
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return copy.workspaceMemberInvited(
        text(p, 'workspaceName') ?? strings.notifications.fallbackWorkspaceName,
      );
    // DEM-154 — board erişim talebi bildirimi (alıcı board admin'i).
    case 'board_access_requested':
    case 'board.access_requested':
      return copy.boardAccessRequested(boardName(p));
    // DEM-152 — granular kart-aktivite tipleri. Her tip kendi özet metniyle;
    // iki activity tipi tek bildirim tipini paylaştığında (`card_completed`,
    // `card_due_changed`) `activityType` payload alanı doğru fiili seçer.
    case 'card_moved':
    case 'card.moved':
      return copy.cardMoved(cardTitle(p));
    case 'card_archived':
      return copy.cardArchived(cardTitle(p));
    case 'card_completed':
      return text(p, 'activityType') === 'card.uncompleted'
        ? copy.cardUncompleted(cardTitle(p))
        : copy.cardCompleted(cardTitle(p));
    case 'card_due_changed':
      return text(p, 'activityType') === 'card.due_cleared'
        ? copy.cardDueCleared(cardTitle(p))
        : copy.cardDueSet(cardTitle(p));
    case 'card_cover_changed':
      return copy.cardCoverChanged(cardTitle(p));
    case 'card_member_removed':
    case 'card.member_removed':
      return copy.cardMemberRemoved(cardTitle(p));
    case 'attachment_added':
    case 'attachment.added':
      return copy.attachmentAdded(cardTitle(p));
    // DEM-153 — kartla ilgili kalan granular tipler (notification tipi +
    // activity-type alias'ı eski payload'lar için birlikte tutulur).
    case 'card_renamed':
    case 'card.renamed':
      return copy.cardRenamed(cardTitle(p));
    case 'card_description_changed':
    case 'card.description_changed':
      return copy.cardDescriptionChanged(cardTitle(p));
    case 'card_label_added':
    case 'card.label_added':
      return copy.cardLabelAdded(cardTitle(p));
    case 'card_label_removed':
    case 'card.label_removed':
      return copy.cardLabelRemoved(cardTitle(p));
    case 'comment_updated':
    case 'comment.updated':
      return copy.commentUpdated(cardTitle(p));
    case 'comment_deleted':
    case 'comment.deleted':
      return copy.commentDeleted(cardTitle(p));
    case 'checklist_created':
    case 'checklist.created':
      return copy.checklistCreated(cardTitle(p));
    case 'checklist_item_added':
    case 'checklist.item_added':
      return copy.checklistItemAdded(cardTitle(p));
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return copy.checklistItemRemoved(cardTitle(p));
    case 'attachment_removed':
    case 'attachment.removed':
      return copy.attachmentRemoved(cardTitle(p));
    // `watched_activity` artık üretilmiyor (DEM-152) ama eski satırlar için
    // fallback olarak korunur — `activityType`'a göre çözer.
    case 'watched_activity':
      switch (text(p, 'activityType')) {
        case 'card.archived':
          return copy.cardArchived(cardTitle(p));
        case 'card.completed':
          return copy.cardCompleted(cardTitle(p));
        case 'card.moved':
          return copy.cardMoved(cardTitle(p));
        default:
          return copy.watchedActivity(cardTitle(p));
      }
    case 'checklist_item_completed':
      return copy.checklistItemCompleted(cardTitle(p));
    case 'card.archived':
      return copy.cardArchived(cardTitle(p));
    case 'card.completed':
      return copy.cardCompleted(cardTitle(p));
    default:
      return copy.default;
  }
}
