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
 * Bildirim merkezi satırı (Faz 7K) — tip ikonu + aktör/özet metni + göreli
 * zaman + okunmamış göstergesi.
 *
 * Sistem (aktörsüz, `due_*`) bildirimlerinde aktör adı basılmaz; bunun yerine
 * "Sistem" rozeti gösterilir (web `notification-center.tsx` deseni). Okunmamış
 * satırlar hafif primary tonlu arka plan + sağ üstte nokta taşır.
 */
export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const theme = themeFor(useColorScheme());
  const unread = notification.readAt == null;
  const system = isSystemNotification(notification.type);
  const iconName = notificationTypeIcon(notification.type);
  const summary = notificationSummary(notification.type, notification.payload);
  const actorName =
    notificationActorName(notification.payload) ?? strings.notifications.fallbackActorName;
  const relativeTime = formatRelativeTime(notification.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-start gap-3 rounded-xl border border-border px-3 py-3 active:opacity-70 ${
        unread ? 'bg-primary/5' : 'bg-card'
      }`}
    >
      <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-muted">
        <Icon name={iconName} size={16} color={theme.mutedForeground} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-sm leading-snug text-foreground">
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
          className="mt-1.5 h-2 w-2 rounded-full bg-primary"
        />
      ) : null}
    </Pressable>
  );
}
