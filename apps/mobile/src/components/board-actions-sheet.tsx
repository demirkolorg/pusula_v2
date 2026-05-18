import { useEffect, useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { InlineComposer } from '@/components/inline-composer';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type BoardActionsSheetProps = {
  visible: boolean;
  /** İşlem yapılacak board başlığı (yeniden adlandırma composer'ının başlangıç değeri). */
  boardTitle: string;
  onRename: (title: string) => void;
  /** Board'u arşivler — çağıran onayı (`Alert`) + navigasyonu üstlenir. */
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
 * DEM-211 — board başlık ⋮ menüsü. `ListActionsSheet`'in board-seviyesi
 * simetriği: iki mod — `menu` (yeniden adlandır / arşivle) ve `rename`
 * (satır-içi composer). Açılışta her zaman `menu` modunda başlar. Yalnız board
 * `admin` ve board arşivli değilken mount edilir (çağıran taraf kararı).
 */
export function BoardActionsSheet({
  visible,
  boardTitle,
  onRename,
  onArchive,
  onClose,
}: BoardActionsSheetProps) {
  const [mode, setMode] = useState<'menu' | 'rename'>('menu');

  // Sheet her açıldığında menü modundan başla.
  useEffect(() => {
    if (visible) setMode('menu');
  }, [visible]);

  return (
    <Sheet visible={visible} title={strings.board.boardActions} onClose={onClose}>
      {mode === 'menu' ? (
        <View className="gap-2">
          <ActionRow
            icon="edit-3"
            label={strings.board.renameBoard}
            onPress={() => setMode('rename')}
          />
          <ActionRow
            icon="archive"
            label={strings.board.archiveBoard}
            destructive
            onPress={onArchive}
          />
        </View>
      ) : (
        <InlineComposer
          placeholder={strings.board.renameBoardPlaceholder}
          submitLabel={strings.common.save}
          initialValue={boardTitle}
          onSubmit={onRename}
          onCancel={() => setMode('menu')}
        />
      )}
    </Sheet>
  );
}
