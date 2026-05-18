import { View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { EntityAvatar } from '@/components/entity-avatar';
import { activityLabel } from '@/lib/activity-summary';
import { formatTimestamp } from '@/lib/format-date';
import { strings } from '@/lib/strings';

type ActivityEvent = RouterOutputs['card']['activity']['list'][number];

/** Kart aktivite feed'i — aktör + Türkçe tip etiketi + zaman (salt-okunur). */
export function ActivityList({ events }: { events: ActivityEvent[] }) {
  return (
    <View className="gap-3">
      {events.map((event) => {
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
    </View>
  );
}
