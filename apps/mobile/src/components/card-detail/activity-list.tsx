import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { EntityAvatar } from '@/components/entity-avatar';
import { activityLabel } from '@/lib/activity-summary';
import { formatTimestamp } from '@/lib/format-date';
import { strings } from '@/lib/strings';

type ActivityEvent = RouterOutputs['card']['activity']['list'][number];

/** Genişletilmeden önce gösterilen en yeni olay sayısı (DEM-204). */
const PREVIEW_COUNT = 4;

/**
 * Kart aktivite feed'i — aktör + Türkçe tip etiketi + zaman (salt-okunur).
 * Aktivite üçüncül içerik: varsayılan yalnız son {@link PREVIEW_COUNT} olay
 * gösterilir, "Tüm aktiviteyi gör" tetikleyicisiyle tümü açılır, "Daha az
 * göster" ile geri toplanır — uzun kart geçmişi ekranı sonsuz uzatmaz (DEM-204).
 */
export function ActivityList({ events }: { events: ActivityEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = events.length > PREVIEW_COUNT;
  const shown = expanded ? events : events.slice(0, PREVIEW_COUNT);

  return (
    <View className="gap-3">
      {shown.map((event) => {
        const actorName = event.actorName ?? strings.cardDetail.unknownUser;
        return (
          <View key={event.id} className="flex-row items-start gap-3">
            <EntityAvatar name={actorName} image={event.actorImage} size={24} />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-foreground">
                <Text weight="semibold" className="text-sm text-foreground">
                  {actorName}
                </Text>{' '}
                {activityLabel(event.type)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {formatTimestamp(event.createdAt)}
              </Text>
            </View>
          </View>
        );
      })}

      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? strings.cardDetail.activityShowLess
              : strings.cardDetail.activityShowAll
          }
          onPress={() => setExpanded((value) => !value)}
          className="self-start active:opacity-70"
        >
          <Text weight="medium" className="text-sm text-primary">
            {expanded
              ? strings.cardDetail.activityShowLess
              : `${strings.cardDetail.activityShowAll} · ${events.length}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
