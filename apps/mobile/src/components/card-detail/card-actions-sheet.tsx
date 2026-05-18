import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardActionsSheetProps = {
  visible: boolean;
  /** Kartı arşivler — çağıran onayı (`Alert`) + navigasyonu üstlenir. */
  onArchive: () => void;
  onClose: () => void;
};

type ActionRowProps = {
  icon: IconName;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

function ActionRow({ icon, label, destructive = false, onPress }: ActionRowProps) {
  const theme = themeFor(useColorScheme());
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 active:opacity-70"
    >
      <Icon name={icon} size={18} color={destructive ? theme.destructive : theme.foreground} />
      <Text className={`text-sm ${destructive ? 'text-destructive' : 'text-foreground'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * DEM-196 — kart detay başlık yanı ⋮ menüsü. Web kart modalı `CardModalHeader`
 * ⋮ menüsünün mobil karşılığı; mevcut `Sheet` (bottom sheet) ile alttan açılır.
 * Şimdilik tek aksiyon (arşivle); ileride taşı/kopyala/geri yükle aynı menüye
 * eklenir. Yalnız board `member+` (`canEdit`) durumunda mount edilir.
 */
export function CardActionsSheet({ visible, onArchive, onClose }: CardActionsSheetProps) {
  return (
    <Sheet visible={visible} title={strings.cardDetail.cardActionsTitle} onClose={onClose}>
      <View className="gap-2">
        <ActionRow
          icon="archive"
          label={strings.cardDetail.archiveAction}
          destructive
          onPress={onArchive}
        />
      </View>
    </Sheet>
  );
}
