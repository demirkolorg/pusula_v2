import type { ReactNode } from 'react';
import { Modal, Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type SheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Faz 7H — alttan açılan basit bottom sheet (`Modal` tabanlı). Liste işlemleri
 * menüsü ve "move to list" picker için ortak kabuk. Cross-platform native
 * ActionSheet yerine NativeWind ile kurulu sade panel. Arka plana (backdrop)
 * dokunmak kapatır; iç içe `Pressable` sayesinde panel içi dokunuş backdrop'a
 * yayılmaz.
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = themeFor(useColorScheme());
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* Panel — `onPress` no-op'ı dokunuşu yutar, backdrop'a yayılmaz. */}
        <Pressable
          onPress={() => {}}
          className="gap-3 rounded-t-2xl bg-background p-4 pb-8"
        >
          <View className="flex-row items-center justify-between">
            <Text weight="semibold" className="text-base text-foreground">
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.common.close}
              hitSlop={8}
              onPress={onClose}
              className="active:opacity-60"
            >
              <Icon name="x" size={22} color={theme.mutedForeground} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
