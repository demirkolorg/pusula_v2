/**
 * Faz 7K — bildirim merkezi mutation'ları: tek satır "okundu işaretle" ve
 * "tümünü okundu işaretle".
 *
 * Optimistic akış (web `notification-center.tsx` deseni): `onMutate`
 * `notifications.list` (tek sayfa) ve `notifications.unreadCount` cache'lerini
 * iyimser günceller + snapshot tutar; `onError` snapshot'a geri sarar;
 * `onSettled` ikisini de invalidate eder. Saf cache dönüşümleri
 * `notification-cache.ts`'te (birim test edilir).
 *
 * `markRead`/`markAllRead` server-side idempotent — yeniden işaretleme no-op.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import {
  decrementUnreadCount,
  incrementUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  resetUnreadCount,
  type NotificationListPage,
  type UnreadCountData,
} from '@/lib/notification-cache';

type NotificationRow = RouterOutputs['notifications']['list']['items'][number];
type NotificationPage = NotificationListPage<NotificationRow>;

/**
 * Bildirim merkezi mutation hook'u. `listInput` cache anahtarının çekildiği
 * `notifications.list` girişiyle (limit) aynı olmalı — aksi halde optimistic
 * `setQueryData` farklı bir anahtarı günceller.
 */
export function useNotificationMutations(listInput: { limit: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listKey = trpc.notifications.list.queryKey(listInput);
  const listFilter = trpc.notifications.list.queryFilter(listInput);
  const unreadKey = trpc.notifications.unreadCount.queryKey();
  const unreadFilter = trpc.notifications.unreadCount.queryFilter();

  const invalidate = () => {
    void queryClient.invalidateQueries(listFilter);
    void queryClient.invalidateQueries(unreadFilter);
  };

  const markReadMutation = useMutation(
    trpc.notifications.markRead.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries(listFilter);
        await queryClient.cancelQueries(unreadFilter);
        const previousList = queryClient.getQueryData<NotificationPage>(listKey);
        const previousUnread = queryClient.getQueryData<UnreadCountData>(unreadKey);
        // Sayacı koşulsuz düş — liste tek sayfayla (25 satır) sınırlı; 25.
        // sıranın altındaki bir bildirimde `previousList` aramaya bağlanmak
        // rozeti optimistic düşüremezdi. Server `{ changed: false }` derse
        // `onSuccess`'te +1 geri alınır (aşağı bkz.).
        queryClient.setQueryData<NotificationPage>(listKey, (old) =>
          markNotificationRead(old, id, new Date()),
        );
        queryClient.setQueryData<UnreadCountData>(unreadKey, (old) =>
          decrementUnreadCount(old),
        );
        return { previousList, previousUnread };
      },
      onSuccess: (result) => {
        // Bildirim zaten okunmuşsa optimistic düşürme gereksizdi — telafi et.
        if (!result.changed) {
          queryClient.setQueryData<UnreadCountData>(unreadKey, (old) =>
            incrementUnreadCount(old),
          );
        }
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousList) queryClient.setQueryData(listKey, ctx.previousList);
        if (ctx?.previousUnread) queryClient.setQueryData(unreadKey, ctx.previousUnread);
      },
      onSettled: invalidate,
    }),
  );

  const markAllReadMutation = useMutation(
    trpc.notifications.markAllRead.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries(listFilter);
        await queryClient.cancelQueries(unreadFilter);
        const previousList = queryClient.getQueryData<NotificationPage>(listKey);
        const previousUnread = queryClient.getQueryData<UnreadCountData>(unreadKey);
        queryClient.setQueryData<NotificationPage>(listKey, (old) =>
          markAllNotificationsRead(old, new Date()),
        );
        queryClient.setQueryData<UnreadCountData>(unreadKey, (old) => resetUnreadCount(old));
        return { previousList, previousUnread };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousList) queryClient.setQueryData(listKey, ctx.previousList);
        if (ctx?.previousUnread) queryClient.setQueryData(unreadKey, ctx.previousUnread);
      },
      onSettled: invalidate,
    }),
  );

  return {
    markRead: (id: string) => markReadMutation.mutate({ id }),
    markAllRead: () => markAllReadMutation.mutate(),
    isMarkingAll: markAllReadMutation.isPending,
  };
}
