import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type CardActionsSheetProps = {
  visible: boolean;
  /** Kartı arşivler — çağıran onayı (`Alert`) + navigasyonu üstlenir. */
  onArchive: () => void;
  /** Kartı başka panoya taşıma akışını açar (LocationPicker sheet — 2026-07-14). */
  onMoveToBoard: () => void;
  onClose: () => void;
};

type ActionRowProps = {
  icon: IconName;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

function ActionRow({ icon, label, destructive = false, onPress }: ActionRowProps) {
  const theme = useTheme();
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
 * "Başka panoya taşı" (2026-07-14) + arşivle; ileride kopyala/geri yükle de
 * buraya eklenir. Yalnız board `member+` (`canEdit`) durumunda mount edilir.
 */
export function CardActionsSheet({
  visible,
  onArchive,
  onMoveToBoard,
  onClose,
}: CardActionsSheetProps) {
  return (
    <Sheet visible={visible} title={strings.cardDetail.cardActionsTitle} onClose={onClose}>
      <View className="gap-2">
        <ActionRow
          icon="corner-up-right"
          label={strings.cardDetail.moveToBoardAction}
          onPress={onMoveToBoard}
        />
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
