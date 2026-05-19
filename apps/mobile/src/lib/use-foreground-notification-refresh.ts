/**
 * DEM-219 — foreground push → cache tazeleme.
 *
 * Mobil realtime kararı: Socket.IO yok. Bu hook socket eklemez; mevcut push
 * teslimini React Query cache invalidate'e bağlar. `use-notification-deep-link`
 * push'a *dokunmayı* (navigasyon) işlerken bu hook foreground'da *gelen* push'u
 * dinler: uygulama açıkken bir bildirim ulaştığında banner gösterilir ama açık
 * board/kart ekranı ve sekme rozeti bayatlamış kalır. Bu hook ilgili tRPC
 * sorgularını sessizce invalidate ederek o boşluğu kapatır.
 *
 * `expo-notifications` `addNotificationReceivedListener` ile yalnız FOREGROUND'da
 * gelen bildirim yakalanır (dokunma değil — o `use-notification-deep-link`'in
 * işi). Toast/banner gösterilmez; yalnız sessiz invalidate.
 *
 * Best-effort: parse/invalidate hataları yutulur — tazeleme UI'yı bloklamamalı.
 * Listener cleanup'ta `remove()` edilir. `AppShell`'de bir kez mount edilir.
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { notificationRefreshScope } from '@/lib/notification-refresh';
import { useTRPC } from '@/trpc/provider';

/**
 * Foreground push → ilgili tRPC sorgularının invalidate'ini kurar. Dönüş değeri
 * yok — yan etki (cache tazeleme) için çağrılır.
 */
export function useForegroundNotificationRefresh(): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      try {
        const data = notification.request.content.data;
        const { boardId, cardId } = notificationRefreshScope(data);

        // Her zaman: bildirim listesi + okunmamış sayısı rozeti tazelenir.
        void queryClient.invalidateQueries(trpc.notifications.list.queryFilter());
        void queryClient.invalidateQueries(trpc.notifications.unreadCount.queryFilter());

        // Açık board ekranı — board verisi (liste + kart yerleşimi).
        if (boardId) {
          void queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        }

        // Açık kart detayı — kartın tüm alt sorguları.
        if (cardId) {
          void queryClient.invalidateQueries(trpc.card.get.queryFilter({ cardId }));
          void queryClient.invalidateQueries(trpc.card.labels.list.queryFilter({ cardId }));
          void queryClient.invalidateQueries(trpc.card.members.list.queryFilter({ cardId }));
          void queryClient.invalidateQueries(trpc.comment.list.queryFilter({ cardId }));
          void queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId }));
          void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
        }
      } catch {
        // Best-effort — payload bozuksa tazeleme atlanır, UI bloklanmaz.
      }
    });

    return () => {
      subscription.remove();
    };
  }, [trpc, queryClient]);
}
