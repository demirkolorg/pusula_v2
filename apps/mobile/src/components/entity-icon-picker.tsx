import { useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { ENTITY_ICONS, type EntityIcon } from '@pusula/domain';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { featherForEntityIcon } from '@/lib/entity-icon';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * DEM-203 WP6 — pano / workspace oluşturma ekranlarının ortak entity ikon
 * seçicisi. Bir tetikleyici satır (seçili ikonu gösterir) + dokununca açılan
 * `Sheet` içinde `ENTITY_ICONS` grid'i. Aşırı mühendislik yok: grid sade bir
 * sarmalanan satır düzeni, seçim anında sheet kapanır.
 *
 * Domain ikon adları Feather setine `featherForEntityIcon` ile köprülenir
 * (`@/lib/entity-icon`) — mobil `Icon` Feather kullanır, web lucide.
 */

type EntityIconPickerProps = {
  /** Tetikleyici satırın etiketi (örn. "İkon"). */
  label: string;
  /** Seçili domain ikonu. */
  value: EntityIcon;
  onChange: (icon: EntityIcon) => void;
};

export function EntityIconPicker({ label, value, onChange }: EntityIconPickerProps) {
  const theme = themeFor(useColorScheme());
  const [open, setOpen] = useState(false);

  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-sm text-foreground">
        {label}
      </Text>

      {/* Tetikleyici satır — seçili ikonu gösterir, dokununca grid açılır. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="h-12 flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 active:opacity-70"
      >
        <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Icon name={featherForEntityIcon(value)} size={18} color={theme.primary} />
        </View>
        <Text weight="medium" className="flex-1 text-sm text-foreground">
          {strings.entityIconPicker.changeAction}
        </Text>
        <Icon name="chevron-down" size={18} color={theme.mutedForeground} />
      </Pressable>

      <Sheet visible={open} title={strings.entityIconPicker.title} onClose={() => setOpen(false)}>
        <ScrollView className="max-h-96" contentContainerClassName="flex-row flex-wrap gap-2">
          {ENTITY_ICONS.map((icon) => {
            const isSelected = icon === value;
            return (
              <Pressable
                key={icon}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(icon);
                  setOpen(false);
                }}
                className={`h-14 w-14 items-center justify-center rounded-lg border ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card active:opacity-70'
                }`}
              >
                <Icon
                  name={featherForEntityIcon(icon)}
                  size={22}
                  color={isSelected ? theme.primary : theme.foreground}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}
