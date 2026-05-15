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
    case 'due_approaching':
      return copy.dueApproaching(cardTitle(p));
    case 'due_reminder_1d':
      return copy.dueReminder1d(cardTitle(p));
    case 'due_reminder_1h':
      return copy.dueReminder1h(cardTitle(p));
    case 'due_overdue':
      return copy.dueOverdue(cardTitle(p));
    case 'board_invitation':
    case 'board.member_invited':
      return copy.boardMemberInvited(boardName(p));
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return copy.workspaceMemberInvited(
        text(p, 'workspaceName') ?? strings.notifications.fallbackWorkspaceName,
      );
    case 'watched_activity':
      switch (text(p, 'activityType')) {
        case 'card.archived':
          return copy.cardArchived(cardTitle(p));
        case 'card.completed':
          return copy.cardCompleted(cardTitle(p));
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
