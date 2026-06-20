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
  /**
   * In-card focus targets (web deep-link "kendini belli et" — mobil simetriği).
   * Worker payload'ı bildirim tipine göre bunlardan birini taşır; modal açılınca
   * ilgili öğeye scroll + flash uygulanır. `itemId` checklist maddesinin legacy
   * anahtarı (mobil `notification-target.ts` ile aynı): `checklistItemId` yoksa
   * yedek olarak okunur.
   */
  commentId?: string | null;
  checklistItemId?: string | null;
  attachmentId?: string | null;
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
    commentId: stringValue(raw.commentId),
    // `checklistItemId` öncelikli; worker bazı tiplerde `itemId` yazar (mobil
    // `notification-target.ts` ile aynı yedek).
    checklistItemId: stringValue(raw.checklistItemId) ?? stringValue(raw.itemId),
    attachmentId: stringValue(raw.attachmentId),
  };
}

export type NotificationGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export type NotificationGroup = {
  key: NotificationGroupKey;
  items: NotificationRow[];
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function classifyByDate(createdAt: Date | string, now: Date): NotificationGroupKey {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'earlier';

  const today = startOfDay(now);
  const created = startOfDay(date);
  const diffDays = Math.round((today.getTime() - created.getTime()) / 86_400_000);

  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'thisWeek';
  return 'earlier';
}

const GROUP_ORDER: NotificationGroupKey[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

/**
 * Bucket notifications into date-relative groups, preserving the incoming order
 * within each bucket. Returned groups follow `GROUP_ORDER` and skip empty ones.
 */
export function groupNotificationsByDate(
  items: NotificationRow[],
  now: Date = new Date(),
): NotificationGroup[] {
  const buckets = new Map<NotificationGroupKey, NotificationRow[]>();

  for (const item of items) {
    const key = classifyByDate(item.createdAt, now);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return GROUP_ORDER.flatMap((key) => {
    const bucketItems = buckets.get(key);
    return bucketItems && bucketItems.length > 0 ? [{ key, items: bucketItems }] : [];
  });
}
