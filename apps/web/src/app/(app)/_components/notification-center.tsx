'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BellIcon, CheckIcon, SettingsIcon, TriangleAlertIcon } from 'lucide-react';
import {
  Avatar,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import type { RouterOutputs } from '@pusula/api';
import { activitySummary } from '@/lib/activity-summary';
import { formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { resolveNotificationLink } from './notification-link';
import type { NotificationGroupKey, NotificationRow } from './notification-types';
import { groupNotificationsByDate, notificationPayload } from './notification-types';
import { notificationTypeIcon } from './notification-type-icon';

const NOTIFICATIONS_LIMIT = 20;

/**
 * Scheduler kaynaklı (aktörsüz) bildirim tipleri — bunları bir kullanıcı
 * tetiklemez, dolayısıyla satırda aktör adı/avatarı gösterilmez. Bkz.
 * `docs/domain/04-bildirim-kurallari.md` → "Sistem (aktörsüz) bildirimler".
 */
const SYSTEM_NOTIFICATION_TYPES = new Set([
  'due_approaching',
  'due_overdue',
  'due_reminder_1d',
  'due_reminder_1h',
]);

function isSystemNotification(type: string): boolean {
  return SYSTEM_NOTIFICATION_TYPES.has(type);
}

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

function groupLabel(key: NotificationGroupKey): string {
  return strings.notifications.groups[key];
}

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listFilter = trpc.notifications.list.infiniteQueryFilter({ limit: NOTIFICATIONS_LIMIT });
  const unreadFilter = trpc.notifications.unreadCount.queryFilter();

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
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
  const unreadCount = items.filter(isUnread).length;
  const allRead = items.length === 0 || unreadCount === 0;
  const groups = groupNotificationsByDate(items);

  const handleOpen = (notification: NotificationRow): void => {
    const link = resolveNotificationLink(notification);
    if (link) router.push(link);
    if (isUnread(notification)) markRead.mutate({ id: notification.id });
    onClose();
  };

  const handleMarkOneRead = (notification: NotificationRow): void => {
    if (!isUnread(notification)) return;
    markRead.mutate({ id: notification.id });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-none">
                {strings.notifications.title}
              </h2>
              <p
                className="text-muted-foreground mt-1 text-xs"
                data-testid="notification-counter"
              >
                {items.length === 0
                  ? strings.notifications.empty
                  : unreadCount > 0
                    ? strings.notifications.unreadCountLabel(unreadCount)
                    : strings.notifications.allCaughtUp}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending || allRead}
              >
                {strings.notifications.markAllRead}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={strings.notifications.openSettings}
                    onClick={() => {
                      router.push('/account?tab=notifications');
                      onClose();
                    }}
                  >
                    <SettingsIcon className="size-4" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {strings.notifications.openSettings}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3" aria-busy>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  data-testid="notification-skeleton"
                  className="bg-muted h-14 w-full animate-pulse rounded-md"
                />
              ))}
            </div>
          ) : isError ? (
            <div
              data-testid="notification-error"
              className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
            >
              <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full">
                <TriangleAlertIcon className="size-5" aria-hidden />
              </span>
              <p className="text-foreground text-sm font-medium">
                {strings.notifications.loadErrorTitle}
              </p>
              <p className="text-muted-foreground text-xs">
                {strings.notifications.loadErrorHint}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => void refetch()}
              >
                {strings.common.retry}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <BellIcon className="size-5" aria-hidden />
              </span>
              <p className="text-foreground text-sm font-medium">
                {strings.notifications.empty}
              </p>
              <p className="text-muted-foreground text-xs">
                {strings.notifications.emptyHint}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={groupLabel(group.key)}>
                <h3
                  data-testid={`notification-group-${group.key}`}
                  className="bg-card/95 supports-[backdrop-filter]:bg-card/80 text-muted-foreground sticky top-0 z-10 border-b px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide backdrop-blur"
                >
                  {groupLabel(group.key)}
                </h3>
                <ul className="divide-border/60 divide-y">
                  {group.items.map((notification) => {
                    const payload = notificationPayload(notification);
                    const system = isSystemNotification(notification.type);
                    const actorName =
                      payload.actorName ?? strings.notifications.fallbackActorName;
                    const unread = isUnread(notification);

                    return (
                      <li
                        key={notification.id}
                        data-testid={`notification-row-${notification.id}`}
                        data-unread={unread ? 'true' : 'false'}
                        className={cn(
                          'group hover:bg-accent focus-visible:ring-ring/60 relative flex cursor-pointer items-start gap-3 px-4 py-3 pr-10 transition focus-visible:outline-none focus-visible:ring-2',
                          unread ? 'bg-primary/5' : 'bg-transparent',
                        )}
                        onClick={() => handleOpen(notification)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleOpen(notification);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="relative mt-0.5 shrink-0">
                          {system ? (
                            <span className="bg-muted flex size-8 items-center justify-center rounded-full">
                              {notificationTypeIcon(notification.type, 'size-4')}
                            </span>
                          ) : (
                            <>
                              <Avatar
                                name={actorName}
                                image={payload.actorImage}
                                size="md"
                              />
                              <span className="bg-card ring-card absolute -right-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full ring-2">
                                {notificationTypeIcon(notification.type, 'size-3')}
                              </span>
                            </>
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-sm leading-snug',
                              !unread && 'text-muted-foreground',
                            )}
                          >
                            {!system && (
                              <>
                                <span
                                  className={cn(
                                    'font-medium',
                                    unread ? 'text-foreground' : 'text-muted-foreground',
                                  )}
                                >
                                  {actorName}
                                </span>{' '}
                              </>
                            )}
                            <span>
                              {activitySummary(notification.type, notification.payload)}
                            </span>
                          </span>
                          <time className="text-muted-foreground mt-1 block text-xs">
                            {formatRelativeTime(notification.createdAt)}
                          </time>
                        </span>

                        {unread && (
                          <span className="absolute top-3 right-3 flex items-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={strings.notifications.markOneRead}
                                  data-testid={`notification-mark-read-${notification.id}`}
                                  className="hover:bg-primary/10 text-primary focus-visible:ring-ring/60 hidden size-6 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 group-hover:flex group-focus-within:flex"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleMarkOneRead(notification);
                                  }}
                                >
                                  <CheckIcon className="size-3.5" aria-hidden />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {strings.notifications.markOneRead}
                              </TooltipContent>
                            </Tooltip>
                            <span
                              aria-label={strings.notifications.unreadDotLabel}
                              data-testid={`notification-unread-dot-${notification.id}`}
                              className="bg-primary block size-2 rounded-full group-hover:hidden group-focus-within:hidden"
                            />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
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
    </TooltipProvider>
  );
}
