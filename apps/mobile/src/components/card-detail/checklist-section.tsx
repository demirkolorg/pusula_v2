import { View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { themeFor } from '@/theme/tokens';

type Checklist = RouterOutputs['checklist']['list'][number];

/** Kart detayında kontrol listeleri — başlık + ilerleme + maddeler (salt-okunur). */
export function ChecklistSection({ checklists }: { checklists: Checklist[] }) {
  const theme = themeFor(useColorScheme());

  return (
    <View className="gap-4">
      {checklists.map((checklist) => {
        const doneCount = checklist.items.filter((item) => item.completed).length;
        return (
          <View key={checklist.id} className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text weight="medium" className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {checklist.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {doneCount}/{checklist.items.length}
              </Text>
            </View>
            {checklist.items.map((item) => (
              <View key={item.id} className="flex-row items-start gap-2">
                <Icon
                  name={item.completed ? 'check-square' : 'square'}
                  size={16}
                  color={item.completed ? theme.success : theme.mutedForeground}
                />
                <Text
                  className={`flex-1 text-sm ${
                    item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {item.content}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
