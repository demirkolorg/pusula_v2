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
  /**
   * Faz 14F (DEM-296) — pano raporu (klasik PDF) indir/paylaş akışı. Çağıran
   * `useDownloadBoardReport` hook'unu tüketir ve `download` callback'ini buraya
   * geçirir. Verilmediğinde aksiyon satırı gizlenir (test/silent kullanım).
   */
  onDownloadReport?: () => void;
  /** İndirme akışı sırasında `true` — aksiyon satırı `İndiriliyor…` gösterir. */
  downloadReportPending?: boolean;
  onClose: () => void;
};

type ActionRowProps = {
  icon: IconName;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ActionRow({ icon, label, destructive = false, disabled = false, onPress }: ActionRowProps) {
  const theme = themeFor(useColorScheme());
  const color = destructive ? theme.destructive : theme.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 ${
        disabled ? 'opacity-50' : 'active:opacity-70'
      }`}
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
  onDownloadReport,
  downloadReportPending = false,
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
          {onDownloadReport && (
            <ActionRow
              icon="download"
              label={
                downloadReportPending
                  ? strings.board.downloadReportBusy
                  : strings.board.downloadReport
              }
              disabled={downloadReportPending}
              onPress={onDownloadReport}
            />
          )}
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
