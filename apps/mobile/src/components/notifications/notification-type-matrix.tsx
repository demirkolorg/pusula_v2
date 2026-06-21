import { View } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import {
  NOTIFICATION_CHANNEL_KEYS,
  groupMatrixRows,
  MATRIX_ROWS,
  type ChannelCellState,
  type MatrixGroupKey,
} from '@/lib/notification-matrix';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Bildirim ayar ekranı "Bildirim tipleri" bölümü (Faz 7K) — tip × kanal
 * matrisi.
 *
 * Web `notifications-type-matrix.tsx`'in fiilî davranışını birebir aynalar:
 * tip-bazlı kanal kaydı backend'de YOK. Mobilde matris **salt-okunur** bir
 * referans tablodur — her tipin hangi kanaldan geldiğini gösterir (açık /
 * her zaman / yok). Gerçek kanal aç/kapa "Genel kanallar" bölümündedir;
 * fazladan toggle yeteneği uydurulmaz.
 */
export function NotificationTypeMatrix() {
  const theme = useTheme();
  const matrix = strings.notificationSettings.matrix;
  const groups = groupMatrixRows(MATRIX_ROWS);

  /** Hücre durumunu ikon + erişilebilir etiketle çizer. */
  const renderCell = (state: ChannelCellState) => {
    if (state === 'unavailable') {
      return (
        <Icon name="minus" size={14} color={theme.mutedForeground} />
      );
    }
    if (state === 'mute_bypass') {
      return <Icon name="lock" size={13} color={theme.primary} />;
    }
    return <Icon name="check" size={14} color={theme.success} />;
  };

  const cellLabel = (state: ChannelCellState): string =>
    state === 'unavailable'
      ? matrix.cellUnavailable
      : state === 'mute_bypass'
        ? matrix.cellBypass
        : matrix.cellOn;

  /** Kanal anahtarını sütun başlığı etiketine eşler. */
  const channelLabel = (channel: (typeof NOTIFICATION_CHANNEL_KEYS)[number]): string =>
    channel === 'in_app'
      ? matrix.channelInApp
      : channel === 'email'
        ? matrix.channelEmail
        : matrix.channelPush;

  return (
    <View className="gap-4">
      {/* Sütun başlıkları. */}
      <View className="flex-row items-center">
        <View className="flex-1" />
        {NOTIFICATION_CHANNEL_KEYS.map((channel) => (
          <Text
            key={channel}
            weight="medium"
            className="w-14 text-center text-[10px] uppercase text-muted-foreground"
          >
            {channel === 'in_app'
              ? matrix.channelInApp
              : channel === 'email'
                ? matrix.channelEmail
                : matrix.channelPush}
          </Text>
        ))}
      </View>

      {groups.map(({ group, rows }) => (
        <View key={group} className="gap-1.5">
          <Text
            weight="semibold"
            className="text-[11px] uppercase text-muted-foreground"
          >
            {matrix.groups[group as MatrixGroupKey]}
          </Text>
          {rows.map((row) => {
            const typeLabel = matrix.types[row.i18nKey as keyof typeof matrix.types];
            return (
              <View key={row.type} className="flex-row items-center py-1">
                <Text className="flex-1 pr-2 text-sm text-foreground" numberOfLines={1}>
                  {typeLabel}
                </Text>
                {NOTIFICATION_CHANNEL_KEYS.map((channel) => {
                  const state = row.channels[channel];
                  return (
                    <View
                      key={channel}
                      accessibilityLabel={`${typeLabel} · ${channelLabel(channel)}: ${cellLabel(state)}`}
                      className="w-14 items-center"
                    >
                      {renderCell(state)}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
