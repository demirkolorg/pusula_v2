import type { ReactNode } from 'react';
import { Modal, Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { useIsTablet } from '@/lib/use-device-class';
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
 *
 * Faz 15D — tablet branch (iPad): bottom sheet yerine **center popover**.
 * `useIsTablet()` (`docs/architecture/18-ipad-uyarlamasi.md` §5) ile ayrım:
 * phone'da mevcut alt-slide davranışı korunur; tablet'te modal fade + viewport
 * center + `max-w-md` panel. Backdrop tap-outside-to-close her iki modda
 * çalışır; `onRequestClose` Modal default'u ESC (external keyboard) ve Android
 * back tuşunu handle eder, yani iPad'de fiziksel klavye ESC'si de kapatır.
 * VoiceOver focus trap RN `Modal`'ın varsayılan davranışı.
 *
 * Anchor-based popover (anchor `View` ref'ine yakın konum) iPad-spesifik
 * V2 enhancement — şu an center default. 15+ kullanım yeri anchor vermiyor;
 * gerektiğinde `anchor?: RefObject<View>` prop'u eklenir.
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = themeFor(useColorScheme());
  const isTablet = useIsTablet();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={isTablet ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <Pressable
        className={
          isTablet
            ? 'flex-1 items-center justify-center bg-black/50 px-6'
            : 'flex-1 justify-end bg-black/50'
        }
        onPress={onClose}
      >
        {/* Panel — `onPress` no-op'ı dokunuşu yutar, backdrop'a yayılmaz. */}
        <Pressable
          onPress={() => {}}
          className={
            isTablet
              ? 'w-full max-w-md gap-3 rounded-2xl bg-background p-4'
              : 'gap-3 rounded-t-2xl bg-background p-4 pb-8'
          }
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
