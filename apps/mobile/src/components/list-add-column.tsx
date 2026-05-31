import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { strings } from '@/lib/strings';
import { useDeviceClass, useIsLandscape } from '@/lib/use-device-class';
import { themeFor } from '@/theme/tokens';

type ListAddColumnProps = {
  onCreate: (title: string) => void;
};

/**
 * Faz 7H — board şeridinin sonundaki "Liste ekle" kolonu. Kapalıyken kesik
 * çerçeveli buton; dokununca satır-içi composer açılır. Composer oluşturduktan
 * sonra açık kalır (art arda liste ekleme).
 *
 * Faz 15B (DEM-302) — kolon genişliği `board-column.tsx` ile aynı responsive
 * kuralı izler (phone w-72, tablet portrait w-80, tablet landscape w-96).
 */
export function ListAddColumn({ onCreate }: ListAddColumnProps) {
  const theme = themeFor(useColorScheme());
  const [open, setOpen] = useState(false);
  const isTablet = useDeviceClass() === 'tablet';
  const isLandscape = useIsLandscape();
  const widthClass = isTablet ? (isLandscape ? 'w-96' : 'w-80') : 'w-72';

  if (open) {
    return (
      <View className={widthClass}>
        <InlineComposer
          placeholder={strings.board.addListPlaceholder}
          submitLabel={strings.board.addList}
          onSubmit={onCreate}
          onCancel={() => setOpen(false)}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.board.addList}
      onPress={() => setOpen(true)}
      className={`h-12 ${widthClass} flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 active:opacity-70`}
    >
      <Icon name="plus" size={18} color={theme.mutedForeground} />
      <Text weight="medium" className="text-sm text-muted-foreground">
        {strings.board.addList}
      </Text>
    </Pressable>
  );
}
