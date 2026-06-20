import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { formatRelativeTime } from '@/lib/format-date';
import {
  isSystemNotification,
  notificationActorName,
  notificationSummary,
  notificationTypeIcon,
  notificationTypeTone,
} from '@/lib/notification-display';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/** `notifications.list` çıktısındaki tek bildirim (router sözleşmesinden). */
export type NotificationItem = RouterOutputs['notifications']['list']['items'][number];

type NotificationRowProps = {
  notification: NotificationItem;
  onPress: () => void;
};

/**
 * Bildirim merkezi satırı (Faz 7K; modern UI 2026-06-20) — kategoriye göre
 * renkli tip ikonu chip'i + aktör/özet metni + göreli zaman + okunmamış noktası.
 *
 * Sistem (aktörsüz, `due_*`) bildirimlerinde aktör adı basılmaz; bunun yerine
 * "Sistem" rozeti gösterilir (web `notification-center.tsx` deseni).
 *
 * Modern görünüm: kenarlıksız yuvarlak kart (`rounded-2xl`), zemin kontrastı
 * okunmuş `bg-muted` / okunmamış `bg-primary/10`; tip ikonu kategori rengiyle
 * tonlanır (`notificationTypeTone` → tinted zemin + renkli ikon). Okunmamış
 * satır sağda primary nokta taşır.
 */
export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const theme = themeFor(useColorScheme());
  const unread = notification.readAt == null;
  const system = isSystemNotification(notification.type);
  const iconName = notificationTypeIcon(notification.type);
  const tone = notificationTypeTone(notification.type, theme);
  const summary = notificationSummary(notification.type, notification.payload);
  const actorName =
    notificationActorName(notification.payload) ?? strings.notifications.fallbackActorName;
  const relativeTime = formatRelativeTime(notification.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-start gap-3 rounded-2xl px-3.5 py-3 active:opacity-70 ${
        unread ? 'bg-primary/10' : 'bg-muted'
      }`}
    >
      {/* Tip ikonu — kategori rengiyle tonlu yuvarlak chip (tinted zemin + renkli
          ikon). `${tone}22` = ~%13 alfa (RN #RRGGBBAA). */}
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${tone}22` }}
      >
        <Icon name={iconName} size={17} color={tone} />
      </View>
      <View className="flex-1 gap-1 pt-0.5">
        <Text className="text-sm leading-snug text-foreground" numberOfLines={4}>
          {system ? (
            <Text weight="medium" className="text-xs text-muted-foreground">
              {strings.notifications.systemBadge}
              {'  '}
            </Text>
          ) : (
            <Text weight="semibold" className="text-sm text-foreground">
              {actorName}{' '}
            </Text>
          )}
          {summary}
        </Text>
        <Text className="text-[11px] text-muted-foreground">{relativeTime}</Text>
      </View>
      {unread ? (
        <View
          accessibilityLabel={strings.notifications.unreadLabel}
          className="mt-2 h-2.5 w-2.5 rounded-full bg-primary"
        />
      ) : null}
    </Pressable>
  );
}
