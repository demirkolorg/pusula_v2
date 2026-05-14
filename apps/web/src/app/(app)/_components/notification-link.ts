import type { NotificationRow } from './notification-types';
import { notificationPayload } from './notification-types';

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

export function resolveNotificationLink(notification: NotificationRow): string | null {
  const payload = notificationPayload(notification);

  if (payload.linkTo?.startsWith('/')) {
    return payload.linkTo;
  }

  if (payload.cardId && payload.boardId && payload.workspaceId) {
    return `/workspaces/${pathPart(payload.workspaceId)}/boards/${pathPart(payload.boardId)}?card=${pathPart(payload.cardId)}`;
  }
  if (payload.boardId && payload.workspaceId) {
    return `/workspaces/${pathPart(payload.workspaceId)}/boards/${pathPart(payload.boardId)}`;
  }
  if (payload.workspaceId) {
    return `/workspaces/${pathPart(payload.workspaceId)}`;
  }
  return null;
}
