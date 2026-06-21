import { Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type ListOption = { id: string; title: string };

type MoveToListSheetProps = {
  visible: boolean;
  /** Board'un aktif listeleri (arşivli liste hedef olamaz). */
  lists: readonly ListOption[];
  /** Kartın şu anki listesi — işaretli + pasif gösterilir. */
  currentListId: string;
  onSelect: (listId: string) => void;
  onClose: () => void;
};

/**
 * Faz 7H — "move to list" picker. Mobil drag-drop yerine kart taşıma: board'un
 * aktif listeleri satır satır; kartın mevcut listesi işaretli ve seçilemez.
 * Bir listeye dokunmak kartı o listenin sonuna taşır.
 */
export function MoveToListSheet({
  visible,
  lists,
  currentListId,
  onSelect,
  onClose,
}: MoveToListSheetProps) {
  const theme = useTheme();
  const hasTarget = lists.some((list) => list.id !== currentListId);

  return (
    <Sheet visible={visible} title={strings.moveToList.title} onClose={onClose}>
      <Text className="text-sm text-muted-foreground">{strings.moveToList.description}</Text>
      {hasTarget ? (
        <ScrollView className="max-h-80" contentContainerClassName="gap-2">
          {lists.map((list) => {
            const isCurrent = list.id === currentListId;
            return (
              <Pressable
                key={list.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
                disabled={isCurrent}
                onPress={() => onSelect(list.id)}
                className={`flex-row items-center gap-3 rounded-lg border px-3 py-3 ${
                  isCurrent ? 'border-primary bg-primary/10' : 'border-border bg-card active:opacity-70'
                }`}
              >
                <Icon
                  name={isCurrent ? 'check-circle' : 'list'}
                  size={18}
                  color={isCurrent ? theme.primary : theme.mutedForeground}
                />
                <Text
                  weight={isCurrent ? 'semibold' : 'regular'}
                  numberOfLines={1}
                  className={`flex-1 text-sm ${isCurrent ? 'text-primary' : 'text-foreground'}`}
                >
                  {list.title}
                </Text>
                {isCurrent ? (
                  <Text className="text-xs text-primary">{strings.moveToList.currentBadge}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text className="py-3 text-sm text-muted-foreground">{strings.moveToList.empty}</Text>
      )}
    </Sheet>
  );
}
