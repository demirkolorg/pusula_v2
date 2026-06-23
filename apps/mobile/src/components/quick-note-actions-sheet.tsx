import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type QuickNoteActionsSheetProps = {
  visible: boolean;
  /** Sheet başlığı — notun ilk satırı (kısaltılmış) gösterilir. */
  title: string;
  onEdit: () => void;
  onConvert: () => void;
  onDelete: () => void;
  onClose: () => void;
};

type ActionRowProps = {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  destructive?: boolean;
  onPress: () => void;
};

function ActionRow({ icon, label, accessibilityLabel, destructive = false, onPress }: ActionRowProps) {
  const theme = useTheme();
  const color = destructive ? theme.destructive : theme.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 active:opacity-70"
    >
      <Icon name={icon} size={18} color={color} />
      <Text className={`text-sm ${destructive ? 'text-destructive' : 'text-foreground'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Hızlı Notlar — bir nota dokununca/uzun basınca açılan aksiyon yüzeyi
 * (`Sheet`). DEM-231'deki kaydırmalı (`SwipeRow`) aksiyonların yerini alır:
 * "Saved Messages" baloncuk tasarımında satır kaydırma yerine baloncuğa
 * dokunma açar (kullanıcı kararı). `list-actions-sheet` ile aynı `ActionRow`
 * deseni. Düzenleme satır-içi yapılır — bu sheet yalnız tetikler (`onEdit`).
 */
export function QuickNoteActionsSheet({
  visible,
  title,
  onEdit,
  onConvert,
  onDelete,
  onClose,
}: QuickNoteActionsSheetProps) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View className="gap-2">
        <ActionRow
          icon="edit-3"
          label={strings.quickNotes.editShort}
          accessibilityLabel={strings.quickNotes.editAction}
          onPress={onEdit}
        />
        <ActionRow
          icon="arrow-right-circle"
          label={strings.quickNotes.convertAction}
          accessibilityLabel={strings.quickNotes.convertAction}
          onPress={onConvert}
        />
        <ActionRow
          icon="trash-2"
          label={strings.quickNotes.deleteConfirmAction}
          accessibilityLabel={strings.quickNotes.deleteAction}
          destructive
          onPress={onDelete}
        />
      </View>
    </Sheet>
  );
}
