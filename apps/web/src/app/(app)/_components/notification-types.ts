import type { RouterOutputs } from '@pusula/api';

export type NotificationRow = RouterOutputs['notifications']['list']['items'][number];

export type NotificationPayload = {
  actorName?: string | null;
  actorImage?: string | null;
  cardTitle?: string | null;
  boardName?: string | null;
  workspaceName?: string | null;
  workspaceId?: string | null;
  boardId?: string | null;
  cardId?: string | null;
  linkTo?: string | null;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function notificationPayload(notification: NotificationRow): NotificationPayload {
  const raw =
    typeof notification.payload === 'object' && notification.payload !== null
      ? (notification.payload as Record<string, unknown>)
      : {};

  return {
    actorName: stringValue(raw.actorName),
    actorImage: stringValue(raw.actorImage),
    cardTitle: stringValue(raw.cardTitle),
    boardName: stringValue(raw.boardName),
    workspaceName: stringValue(raw.workspaceName),
    workspaceId: stringValue(raw.workspaceId) ?? notification.workspaceId,
    boardId: stringValue(raw.boardId) ?? notification.boardId,
    cardId: stringValue(raw.cardId) ?? notification.cardId,
    linkTo: stringValue(raw.linkTo),
  };
}
