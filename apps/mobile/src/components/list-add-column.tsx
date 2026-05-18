import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type ListAddColumnProps = {
  onCreate: (title: string) => void;
};

/**
 * Faz 7H — board şeridinin sonundaki "Liste ekle" kolonu. Kapalıyken kesik
 * çerçeveli buton; dokununca satır-içi composer açılır. Composer oluşturduktan
 * sonra açık kalır (art arda liste ekleme).
 */
export function ListAddColumn({ onCreate }: ListAddColumnProps) {
  const theme = themeFor(useColorScheme());
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <View className="w-72">
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
      className="h-12 w-72 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 active:opacity-70"
    >
      <Icon name="plus" size={18} color={theme.mutedForeground} />
      <Text weight="medium" className="text-sm text-muted-foreground">
        {strings.board.addList}
      </Text>
    </Pressable>
  );
}
