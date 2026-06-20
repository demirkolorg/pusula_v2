import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { MasterDetailLayout } from '@/components/master-detail-layout';
import { NotificationDetail } from '@/components/notifications/notification-detail';
import { Text } from '@/components/text';
import { SwipeRow } from '@/components/swipe-row';
import {
  NotificationRow,
  type NotificationItem,
} from '@/components/notifications/notification-row';
import { groupNotificationsByDate } from '@/lib/notification-grouping';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useIsTablet } from '@/lib/use-device-class';
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
  const isTablet = useIsTablet();
  const navInset = useFloatingNavInset();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  // Tablet sidebar genişliği — hesap ekranıyla simetri (landscape geniş, portrait dar).
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  // Tablet master-detail'de sağ pane'de açık bildirim; ilk açılışta seçim yok
  // (boş durum gösterilir). Telefonda kullanılmaz (satır `router.push` eder).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Aktif "Bildirimler" sekmesine tekrar dokununca listeyi en üste kaydır
  // (standart React Navigation deseni; floating pill `tabPress` yayar). 2026-06-20.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

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

  // Bir bildirime dokunma → kart DEĞİL, bildirim detay ekranı (Faz 5+6).
  // Telefonda tam-sayfa route push; tablette sağ pane'de seçili kıl. markRead
  // detay ekranı açılınca orada da yapılır (idempotent) — burada eager yapıp
  // satırın okunmuş görünmesini hızlandırırız.
  const openNotification = useCallback(
    (notification: NotificationItem) => {
      if (notification.readAt == null) markRead(notification.id);
      if (isTablet) {
        setSelectedId(notification.id);
      } else {
        router.push({ pathname: '/notifications/[id]', params: { id: notification.id } });
      }
    },
    [isTablet, markRead, router],
  );

  // Liste gövdesi — telefonda tam ekran, tablette master-detail sol pane.
  // (`SafeAreaView` ve master-detail sarmalı en altta uygulanır.)
  const listBody = (
    <>
      {/* Ekran-içi başlık + aksiyonlar (sekme ekranı — native header yok).
          Modern UI 2026-06-20: başlık yanında okunmamış sayısı pill rozeti,
          aksiyon ikonları yuvarlak `bg-muted` chip içinde (daha tappable). */}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text weight="semibold" className="text-2xl text-foreground">
              {strings.notifications.title}
            </Text>
            {unreadCount > 0 ? (
              <View className="min-w-6 items-center rounded-full bg-primary px-2 py-0.5">
                <Text weight="semibold" className="text-[11px] text-primary-foreground">
                  {unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
          {unreadCount > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {strings.notifications.unreadSummary(unreadCount)}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.notifications.markAllRead}
            accessibilityState={{ disabled: !hasUnread || isMarkingAll }}
            disabled={!hasUnread || isMarkingAll}
            hitSlop={8}
            onPress={markAllRead}
            className={`h-10 w-10 items-center justify-center rounded-full bg-muted ${
              !hasUnread || isMarkingAll ? 'opacity-40' : 'active:opacity-60'
            }`}
          >
            <Icon name="check-circle" size={20} color={theme.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.notificationSettings.title}
            hitSlop={8}
            onPress={() => router.push('/notification-settings')}
            className="h-10 w-10 items-center justify-center rounded-full bg-muted active:opacity-60"
          >
            <Icon name="settings" size={20} color={theme.foreground} />
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
          contentContainerStyle={{ paddingBottom: navInset || 0 }}
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
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-5 p-4"
          contentContainerStyle={{ paddingBottom: navInset || 16 }}
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
              <View className="flex-row items-center gap-2 px-0.5">
                <Text
                  weight="semibold"
                  className="text-xs uppercase text-muted-foreground"
                >
                  {strings.notifications.groups[group.key]}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {group.items.length}
                </Text>
              </View>
              <View className="gap-2">
                {group.items.map((notification) => {
                  const row = (
                    <NotificationRow
                      notification={notification}
                      onPress={() => openNotification(notification)}
                    />
                  );
                  // Okunmamışsa sola kaydır → "Okundu" (markRead, navigasyon yok).
                  // Okunmuşta kaydırılacak aksiyon yok (sil mutation'ı yok).
                  return notification.readAt == null ? (
                    <SwipeRow
                      key={notification.id}
                      actions={[
                        {
                          key: 'read',
                          label: strings.notifications.markReadAction,
                          accessibilityLabel: strings.notifications.markReadAction,
                          icon: 'check',
                          variant: 'primary',
                          onPress: () => markRead(notification.id),
                        },
                      ]}
                    >
                      {row}
                    </SwipeRow>
                  ) : (
                    <View key={notification.id}>{row}</View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );

  // ───────────────────────── Tablet master-detail ─────────────────────────
  // Hesap ekranıyla simetrik (DEM-303): sol liste (master) + sağ detay pane.
  // Seçili bildirim yoksa pane boş durum gösterir (`NotificationDetail` içinde).
  if (isTablet) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
        <MasterDetailLayout
          master={listBody}
          detail={<NotificationDetail notificationId={selectedId} />}
          sidebarWidth={sidebarWidth}
          testID="notifications-master-detail"
        />
      </SafeAreaView>
    );
  }

  // ───────────────────────── Telefon (tam ekran liste) ─────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {listBody}
    </SafeAreaView>
  );
}
