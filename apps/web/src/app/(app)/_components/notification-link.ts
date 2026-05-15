import type { NotificationRow } from './notification-types';
import { notificationPayload } from './notification-types';

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

export function resolveNotificationLink(notification: NotificationRow): string | null {
  const payload = notificationPayload(notification);

  // Faz 6 review fix (W3 DEM-93): protocol-relative URL koruması. `//evil.com/x`
  // form'u `/` ile başlar ve çoğu tarayıcıda `https://evil.com/x` olarak resolve
  // edilir; defansif kontrol open-redirect riskini kapatır. `linkTo` worker'dan
  // gelir (trusted) ama defense-in-depth disiplini.
  if (
    payload.linkTo &&
    payload.linkTo.startsWith('/') &&
    !payload.linkTo.startsWith('//') &&
    !payload.linkTo.startsWith('/\\')
  ) {
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
