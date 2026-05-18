import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { formatDueDate } from '@/lib/format-date';
import { isSameDay, presetDate, type PresetKind } from '@/lib/due-date-presets';
import { strings } from '@/lib/strings';

/**
 * Son tarih hazır-ayar seçici — DEM-203 WP5 (kart oluşturma akışı).
 *
 * `card-detail/due-date-sheet.tsx`'in `DueDateSheetBody`'si mevcut bir karta
 * bağlıdır (`cardId` + `card.update` optimistic mutation). Kart oluşturma
 * akışında henüz kart yoktur: bu bileşen aynı hazır-ayar mantığını (bugün /
 * yarın / hafta sonu / gelecek hafta) kart-bağımsız, kontrollü bir `value`
 * (`Date | null`) olarak sunar — seçilen tarih `card.create` sonrası
 * `card.update({ dueAt })` ile uygulanır.
 *
 * Belirli bir tarih için takvim sunmaz (kart oluşturmada sade tutulur); kartın
 * detay ekranındaki tam takvim seçici (`DueDateSheetBody`) o işi karşılar.
 *
 * Hazır-ayar tarih hesabı (`presetDate` / `isSameDay`) saf `lib/due-date-presets`
 * modülünden gelir — birim testleri orada.
 */

const PRESETS: { kind: PresetKind; label: string }[] = [
  { kind: 'today', label: strings.cardDetail.dueToday },
  { kind: 'tomorrow', label: strings.cardDetail.dueTomorrow },
  { kind: 'weekend', label: strings.cardDetail.dueWeekend },
  { kind: 'nextWeek', label: strings.cardDetail.dueNextWeek },
];

type DueDatePresetPickerProps = {
  /** Seçili son tarih — `null` ise hiçbir hazır-ayar vurgulanmaz. */
  value: Date | null;
  /** Hazır-ayar dokunuşunda yeni tarih; aynı çipe tekrar dokununca `null`. */
  onChange: (value: Date | null) => void;
  /** Mutation uçuştayken çipleri devre dışı bırakır. */
  disabled?: boolean;
};

export function DueDatePresetPicker({ value, onChange, disabled = false }: DueDatePresetPickerProps) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const presetValue = presetDate(preset.kind);
          const isSelected = value != null && isSameDay(value, presetValue);
          return (
            <Pressable
              key={preset.kind}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled }}
              disabled={disabled}
              // Aynı çipe tekrar dokunmak seçimi temizler — ayrı "kaldır"a gerek yok.
              onPress={() => onChange(isSelected ? null : presetValue)}
              className={`rounded-full border px-3 py-1.5 ${
                isSelected ? 'border-primary bg-primary/10' : 'border-border bg-card'
              } ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
            >
              <Text
                weight={isSelected ? 'semibold' : 'regular'}
                className={`text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-sm text-muted-foreground">
        {value != null
          ? strings.createCard.dueSelected(formatDueDate(value))
          : strings.createCard.dueEmpty}
      </Text>
    </View>
  );
}
