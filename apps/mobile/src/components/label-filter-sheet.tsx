import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { labelColorHex } from '@/lib/label-color';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type LabelFilterSheetProps = {
  visible: boolean;
  boardId: string;
  /** Şu an seçili etiket id'leri (board ekranında tutulur). */
  selectedLabelIds: ReadonlySet<string>;
  /** Bir etiketi seçime ekler/çıkarır. */
  onToggle: (labelId: string) => void;
  /** Tüm seçimi temizler. */
  onClear: () => void;
  onClose: () => void;
};

/**
 * Faz 7E-2 (DEM-200) — board etiket filtresi bottom sheet'i. Board etiketleri
 * (`label.list`) çoklu-seçilebilir renkli chip'ler olarak listelenir; bir
 * chip'e dokunmak onu seçime ekler/çıkarır (OR semantiği — `board-filter.ts`).
 * Filtreleme istemci tarafı; bu bileşen yalnız seçimi toplar, board ekranı
 * kartları daraltır. `label.list` sorgusu yalnız sheet açıkken çalışır.
 */
export function LabelFilterSheet({
  visible,
  boardId,
  selectedLabelIds,
  onToggle,
  onClear,
  onClose,
}: LabelFilterSheetProps) {
  const trpc = useTRPC();
  const theme = useTheme();
  const labelsQuery = useQuery(
    trpc.label.list.queryOptions({ boardId }, { enabled: visible }),
  );

  const labels = labelsQuery.data ?? [];

  return (
    <Sheet visible={visible} title={strings.boardFilter.title} onClose={onClose}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-sm text-muted-foreground">
          {strings.boardFilter.description}
        </Text>
        {selectedLabelIds.size > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.boardFilter.clear}
            hitSlop={8}
            onPress={onClear}
            className="active:opacity-60"
          >
            <Text weight="semibold" className="text-sm text-primary">
              {strings.boardFilter.clear}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {labelsQuery.isPending ? (
        <Text className="py-3 text-sm text-muted-foreground">{strings.common.loading}</Text>
      ) : labels.length === 0 ? (
        <Text className="py-3 text-sm text-muted-foreground">{strings.boardFilter.empty}</Text>
      ) : (
        <ScrollView className="max-h-80" contentContainerClassName="gap-2">
          {labels.map((label) => {
            const selected = selectedLabelIds.has(label.id);
            return (
              <Pressable
                key={label.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label.name ?? strings.cardDetail.labelUnnamed}
                onPress={() => onToggle(label.id)}
                className={`flex-row items-center gap-3 rounded-lg border px-3 py-3 ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card active:opacity-70'
                }`}
              >
                <View
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: labelColorHex(label.color) }}
                />
                <Text
                  weight={selected ? 'semibold' : 'regular'}
                  numberOfLines={1}
                  className={`flex-1 text-sm ${selected ? 'text-primary' : 'text-foreground'}`}
                >
                  {label.name ?? strings.cardDetail.labelUnnamed}
                </Text>
                {selected ? (
                  <Icon name="check" size={18} color={theme.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}
