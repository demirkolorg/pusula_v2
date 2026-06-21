import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { EntityAvatar } from '@/components/entity-avatar';
import { formatRelativeTime } from '@/lib/format-date';
import {
  isSystemNotification,
  notificationActorImage,
  notificationActorName,
  notificationSummary,
  notificationTypeIcon,
  notificationTypeTone,
} from '@/lib/notification-display';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/** `notifications.list` çıktısındaki tek bildirim (router sözleşmesinden). */
export type NotificationItem = RouterOutputs['notifications']['list']['items'][number];

type NotificationRowProps = {
  notification: NotificationItem;
  /** Satıra dokununca seçim — stabil referans (memo'yu korur; satır içinde
   *  `notification` ile çağrılır, böylece her render yeni closure üretilmez). */
  onSelect: (notification: NotificationItem) => void;
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
export const NotificationRow = memo(function NotificationRow({
  notification,
  onSelect,
}: NotificationRowProps) {
  const theme = useTheme();
  const unread = notification.readAt == null;
  const system = isSystemNotification(notification.type);
  const iconName = notificationTypeIcon(notification.type);
  const tone = notificationTypeTone(notification.type, theme);
  const summary = notificationSummary(notification.type, notification.payload);
  const actorName =
    notificationActorName(notification.payload) ?? strings.notifications.fallbackActorName;
  const actorImage = notificationActorImage(notification.payload);
  const relativeTime = formatRelativeTime(notification.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(notification)}
      className={`flex-row items-stretch overflow-hidden rounded-2xl active:opacity-70 ${
        unread ? 'bg-primary/10' : 'bg-card'
      }`}
    >
      {/* Sol kimlik şeridi — bildirim tipinin tonu (kırmızı=acil, turuncu=teslim,
          yeşil=tamamlandı, primary=sana yönelik, gri=genel aktivite). Okunmuşta
          soluk (opacity) → okundu hissi korunur. Workspace kartı şeridiyle aynı dil. */}
      <View style={{ width: 4, backgroundColor: tone, opacity: unread ? 1 : 0.5 }} />
      <View className="flex-1 flex-row items-start gap-3 px-3.5 py-3">
      {/* Sol görsel:
          - Sistem (aktörsüz) bildirim → kategori rengiyle tonlu ikon chip'i.
          - Kişi bildirimi → aktör avatarı + sağ-alt köşede küçük tip-ikonu rozeti.
            Avatar "kim" sorusunu, rozet "ne tür" sorusunu aynı anda yanıtlar
            (web `notification-center.tsx` deseni). `${tone}22` = ~%13 alfa
            (RN #RRGGBBAA). */}
      {system ? (
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tone}22` }}
        >
          <Icon name={iconName} size={17} color={tone} />
        </View>
      ) : (
        <View className="relative">
          <EntityAvatar name={actorName} image={actorImage} size={40} />
          {/* Rozet opak (bg-background) + satır zemininde 2px halka → hem avatar
              fotoğrafından hem satır zemininden net ayrışır; içte tonlu ikon. */}
          <View
            className="absolute -bottom-1.5 -right-1.5 h-7 w-7 items-center justify-center rounded-full bg-background"
            style={{ borderWidth: 2, borderColor: unread ? `${theme.primary}1a` : theme.card }}
          >
            <Icon name={iconName} size={15} color={tone} />
          </View>
        </View>
      )}
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
      </View>
    </Pressable>
  );
});
