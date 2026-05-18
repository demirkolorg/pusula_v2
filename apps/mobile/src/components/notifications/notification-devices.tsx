import { View, useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { formatRelativeTime } from '@/lib/format-date';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';
import { themeFor } from '@/theme/tokens';

type PushTokenRow = RouterOutputs['push']['tokens']['list'][number];

/** Platform → Feather ikon adı. */
function platformIcon(platform: string): IconName {
  return platform === 'web' ? 'monitor' : 'smartphone';
}

/** Platform → görünür etiket. */
function platformLabel(platform: string): string {
  const devices = strings.notificationSettings.devices;
  if (platform === 'ios') return devices.platformIos;
  if (platform === 'android') return devices.platformAndroid;
  return devices.platformWeb;
}

/**
 * Bildirim ayar ekranı "Cihazlar" bölümü (Faz 7K) — kullanıcının anlık
 * bildirim alan aktif cihazları. `push.tokens.list` ham token string'i
 * dönmez; yalnız tanıtıcı meta (platform, cihaz adı, son kullanım).
 *
 * Mobil MVP salt-okunur listeler — cihaz iptali (`revokeById`) bu fazda yok
 * (web Faz 10E'de var); mobilde kendi cihazını logout'la iptal eder.
 */
export function NotificationDevices() {
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const devices = strings.notificationSettings.devices;
  const query = useQuery(trpc.push.tokens.list.queryOptions());

  if (query.isPending) {
    return <Text className="text-sm text-muted-foreground">{strings.common.loading}</Text>;
  }
  if (query.isError) {
    return <Text className="text-sm text-destructive">{devices.loadError}</Text>;
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <Text className="text-sm text-muted-foreground">{devices.empty}</Text>;
  }

  return (
    <View className="gap-3">
      {rows.map((row: PushTokenRow) => {
        const lastSeen = row.lastUsedAt ?? row.createdAt;
        return (
          <View key={row.id} className="flex-row items-center gap-3">
            <Icon name={platformIcon(row.platform)} size={18} color={theme.mutedForeground} />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-foreground" numberOfLines={1}>
                {row.deviceName?.trim() || devices.unnamedDevice}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {platformLabel(row.platform)} · {devices.lastUsed(formatRelativeTime(lastSeen))}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
