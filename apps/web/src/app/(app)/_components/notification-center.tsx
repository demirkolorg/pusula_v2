'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Avatar, Button, cn } from '@pusula/ui';
import type { RouterOutputs } from '@pusula/api';
import { activitySummary } from '@/lib/activity-summary';
import { formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { resolveNotificationLink } from './notification-link';
import type { NotificationRow } from './notification-types';
import { notificationPayload } from './notification-types';
import { notificationTypeIcon } from './notification-type-icon';

const NOTIFICATIONS_LIMIT = 20;

type NotificationPage = RouterOutputs['notifications']['list'];
type NotificationListData = InfiniteData<NotificationPage, string | null>;

type OptimisticContext = {
  listSnapshot?: NotificationListData;
  unreadSnapshot?: { count: number };
};

function isUnread(notification: NotificationRow): boolean {
  return notification.readAt == null;
}

function flattenPages(data: NotificationListData | undefined): NotificationRow[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function withReadNotification(
  old: NotificationListData | undefined,
  id: string,
  readAt: Date,
): NotificationListData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.map((notification) =>
        notification.id === id ? { ...notification, readAt } : notification,
      ),
    })),
  };
}

function withAllRead(
  old: NotificationListData | undefined,
  readAt: Date,
): NotificationListData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.map((notification) =>
        notification.readAt == null ? { ...notification, readAt } : notification,
      ),
    })),
  };
}

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listFilter = trpc.notifications.list.infiniteQueryFilter({ limit: NOTIFICATIONS_LIMIT });
  const unreadFilter = trpc.notifications.unreadCount.queryFilter();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    trpc.notifications.list.infiniteQueryOptions(
      { limit: NOTIFICATIONS_LIMIT },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    ),
  );

  const markRead = useMutation(
    trpc.notifications.markRead.mutationOptions({
      onMutate: async ({ id }): Promise<OptimisticContext> => {
        await queryClient.cancelQueries(listFilter);
        await queryClient.cancelQueries(unreadFilter);
        const listSnapshot = queryClient.getQueryData<NotificationListData>(listFilter.queryKey);
        const unreadSnapshot = queryClient.getQueryData<{ count: number }>(unreadFilter.queryKey);
        const wasUnread = flattenPages(listSnapshot).some(
          (notification) => notification.id === id && isUnread(notification),
        );

        queryClient.setQueryData<NotificationListData>(listFilter.queryKey, (old) =>
          withReadNotification(old, id, new Date()),
        );
        if (wasUnread) {
          queryClient.setQueryData<{ count: number }>(unreadFilter.queryKey, (old) =>
            old ? { count: Math.max(0, old.count - 1) } : old,
          );
        }

        return { listSnapshot, unreadSnapshot };
      },
      onError: (_error, _input, context) => {
        if (context?.listSnapshot) {
          queryClient.setQueryData(listFilter.queryKey, context.listSnapshot);
        }
        if (context?.unreadSnapshot) {
          queryClient.setQueryData(unreadFilter.queryKey, context.unreadSnapshot);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listFilter);
        void queryClient.invalidateQueries(unreadFilter);
      },
    }),
  );

  const markAllRead = useMutation(
    trpc.notifications.markAllRead.mutationOptions({
      onMutate: async (): Promise<OptimisticContext> => {
        await queryClient.cancelQueries(listFilter);
        await queryClient.cancelQueries(unreadFilter);
        const listSnapshot = queryClient.getQueryData<NotificationListData>(listFilter.queryKey);
        const unreadSnapshot = queryClient.getQueryData<{ count: number }>(unreadFilter.queryKey);

        queryClient.setQueryData<NotificationListData>(listFilter.queryKey, (old) =>
          withAllRead(old, new Date()),
        );
        queryClient.setQueryData<{ count: number }>(unreadFilter.queryKey, (old) =>
          old ? { count: 0 } : old,
        );

        return { listSnapshot, unreadSnapshot };
      },
      onError: (_error, _input, context) => {
        if (context?.listSnapshot) {
          queryClient.setQueryData(listFilter.queryKey, context.listSnapshot);
        }
        if (context?.unreadSnapshot) {
          queryClient.setQueryData(unreadFilter.queryKey, context.unreadSnapshot);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listFilter);
        void queryClient.invalidateQueries(unreadFilter);
      },
    }),
  );

  const items = flattenPages(data as NotificationListData | undefined);
  const allRead = items.length === 0 || items.every((notification) => !isUnread(notification));

  const handleClick = (notification: NotificationRow): void => {
    const link = resolveNotificationLink(notification);
    if (link) router.push(link);
    if (isUnread(notification)) markRead.mutate({ id: notification.id });
    onClose();
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{strings.notifications.title}</h2>
          {items.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {strings.notifications.unreadCountLabel(items.filter(isUnread).length)}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || allRead}
        >
          {strings.notifications.markAllRead}
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3" aria-busy>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                data-testid="notification-skeleton"
                className="bg-muted h-12 w-full animate-pulse rounded-md"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground p-6 text-center text-sm">
            {strings.notifications.empty}
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((notification) => {
              const payload = notificationPayload(notification);
              const actorName = payload.actorName ?? strings.notifications.fallbackActorName;
              const unread = isUnread(notification);

              return (
                <li
                  key={notification.id}
                  data-testid={`notification-row-${notification.id}`}
                  data-unread={unread ? 'true' : 'false'}
                  className={cn(
                    'hover:bg-accent/50 flex cursor-pointer items-start gap-3 px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    unread && 'border-l-2 border-primary bg-accent/30',
                  )}
                  onClick={() => handleClick(notification)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleClick(notification);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="relative mt-0.5 shrink-0">
                    <Avatar name={actorName} image={payload.actorImage} size="sm" />
                    <span className="bg-card absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full border">
                      {notificationTypeIcon(notification.type, 'size-3')}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">
                      <span className="font-medium">{actorName}</span>{' '}
                      <span>{activitySummary(notification.type, notification.payload)}</span>
                    </span>
                    <time className="text-muted-foreground mt-0.5 block text-xs">
                      {formatRelativeTime(notification.createdAt)}
                    </time>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {hasNextPage && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {strings.notifications.loadMore}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
