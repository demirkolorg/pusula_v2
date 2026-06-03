import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import {
  NotificationRow,
  type NotificationItem,
} from '@/components/notifications/notification-row';
import { groupNotificationsByDate } from '@/lib/notification-grouping';
import { notificationTarget } from '@/lib/notification-target';
import { strings } from '@/lib/strings';
import { useNotificationMutations } from '@/lib/use-notification-mutations';
import { themeFor } from '@/theme/tokens';

/**
 * Sayfa başına bildirim. `notifications.list` `cursor` ile sayfalama destekler;
 * mobil MVP ilk sayfayı tek `useQuery` ile gösterir (7I arama "ilk 25" deseni
 * gibi sade) — load-more yok. 25'ten eski bildirimler bir sonraki fazda.
 */
const NOTIFICATIONS_LIMIT = 25;

/** `notifications.list` sorgu girişi — sabit referans (her render'da yeniden
 * türetilirse `useNotificationMutations` cache anahtarı kayar). */
const LIST_INPUT = { limit: NOTIFICATIONS_LIMIT } as const;

/**
 * "Bildirimler" sekmesi (Faz 7K) — bildirim merkezi.
 *
 * `notifications.list` (ilk sayfa) bildirimleri tarih gruplarıyla
 * (Bugün/Dün/Bu hafta/Daha eski) listeler; satıra dokununca `markRead`
 * (idempotent) + `notification-target` ile hedefe yönlendirir. Header'da
 * "Tümünü okundu işaretle" (`markAllRead`) ve bildirim ayarları (dişli)
 * butonları. Pull-to-refresh ile yeniden çekilir (7M deseni).
 *
 * Sekme rozeti `unreadCount`'tan `(app)/_layout.tsx`'te beslenir.
 */
export default function NotificationsScreen() {
  const trpc = useTRPC();
  const router = useRouter();
  const theme = themeFor(useColorScheme());

  const query = useQuery(
    trpc.notifications.list.queryOptions(LIST_INPUT, { placeholderData: keepPreviousData }),
  );
  // Okunmamış sayısı — sekme rozetiyle AYNI kaynak (`unreadCount`) ki başlık
  // özeti rozetle birebir tutarlı olsun. Liste hem okunmuş hem okunmamışı
  // gösterir (geçmiş); rozet + bu özet yalnız okunmamışı sayar.
  const unreadQuery = useQuery(trpc.notifications.unreadCount.queryOptions());
  const unreadCount = unreadQuery.data?.count ?? 0;
  const { markRead, markAllRead, isMarkingAll } = useNotificationMutations(LIST_INPUT);

  const items = query.data?.items ?? [];
  const groups = groupNotificationsByDate(items);
  const hasUnread = items.some((item) => item.readAt == null);

  const loading = query.isPending;
  const errored = query.isError && !query.isFetching && !query.data;

  const openNotification = useCallback(
    (notification: NotificationItem) => {
      if (notification.readAt == null) markRead(notification.id);
      const target = notificationTarget(notification);
      if (target) router.push(target);
    },
    [markRead, router],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Ekran-içi başlık + aksiyonlar (sekme ekranı — native header yok). */}
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <View>
          <Text weight="semibold" className="text-2xl text-foreground">
            {strings.notifications.title}
          </Text>
          {unreadCount > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {strings.notifications.unreadSummary(unreadCount)}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.notifications.markAllRead}
            accessibilityState={{ disabled: !hasUnread || isMarkingAll }}
            disabled={!hasUnread || isMarkingAll}
            hitSlop={8}
            onPress={markAllRead}
            className={!hasUnread || isMarkingAll ? 'opacity-40' : 'active:opacity-60'}
          >
            <Icon name="check-circle" size={21} color={theme.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.notificationSettings.title}
            hitSlop={8}
            onPress={() => router.push('/notification-settings')}
            className="active:opacity-60"
          >
            <Icon name="settings" size={21} color={theme.foreground} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <EmptyState
          icon="bell"
          title={strings.common.loading}
          description={strings.notifications.title}
        />
      ) : errored ? (
        <EmptyState
          icon="alert-triangle"
          title={strings.notifications.loadErrorTitle}
          description={strings.notifications.loadErrorBody}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => query.refetch()}
            />
          </View>
        </EmptyState>
      ) : items.length === 0 ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
        >
          <EmptyState
            icon="bell"
            title={strings.notifications.emptyTitle}
            description={strings.notifications.emptyBody}
          />
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-4"
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
        >
          {groups.map((group) => (
            <View key={group.key} className="gap-2">
              <Text
                weight="semibold"
                className="text-xs uppercase text-muted-foreground"
              >
                {strings.notifications.groups[group.key]}
              </Text>
              <View className="gap-2">
                {group.items.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onPress={() => openNotification(notification)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
