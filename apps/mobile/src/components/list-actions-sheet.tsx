import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { InlineComposer } from '@/components/inline-composer';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type ListActionsSheetProps = {
  visible: boolean;
  /** İşlem yapılacak liste; kapalıyken `null`. */
  list: { id: string; title: string } | null;
  onRename: (title: string) => void;
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
  const theme = useTheme();
  const color = destructive ? theme.destructive : theme.foreground;
  return (
    <Pressable
      accessibilityRole="button"
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
 * Faz 7H — board kolonu ⋮ menüsü. İki mod: `menu` (yeniden adlandır / arşivle)
 * ve `rename` (satır-içi composer). Açılışta her zaman `menu` modunda başlar.
 */
export function ListActionsSheet({
  visible,
  list,
  onRename,
  onArchive,
  onClose,
}: ListActionsSheetProps) {
  const [mode, setMode] = useState<'menu' | 'rename'>('menu');

  // Sheet her açıldığında menü modundan başla.
  useEffect(() => {
    if (visible) setMode('menu');
  }, [visible]);

  if (!list) return null;

  return (
    <Sheet visible={visible} title={list.title} onClose={onClose}>
      {mode === 'menu' ? (
        <View className="gap-2">
          <ActionRow
            icon="edit-3"
            label={strings.board.renameList}
            onPress={() => setMode('rename')}
          />
          <ActionRow
            icon="archive"
            label={strings.board.archiveList}
            destructive
            onPress={onArchive}
          />
        </View>
      ) : (
        <InlineComposer
          placeholder={strings.board.renameListPlaceholder}
          submitLabel={strings.common.save}
          initialValue={list.title}
          onSubmit={onRename}
          onCancel={() => setMode('menu')}
        />
      )}
    </Sheet>
  );
}
