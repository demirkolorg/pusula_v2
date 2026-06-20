import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Icon } from '@/components/icon';
import { SwipeRow } from '@/components/swipe-row';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type ChecklistItem = RouterOutputs['checklist']['list'][number]['items'][number];

type ChecklistItemRowProps = {
  item: ChecklistItem;
  /** Henüz sunucuda olmayan optimistic satır mı — etkileşim devre dışı. */
  optimistic: boolean;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
  onToggle: (completed: boolean) => void;
  /** Metne dokununca — üst bileşen madde düzenleme sheet'ini açar. */
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Verilirse satır madde yorum rozetini gösterir; rozete (ya da `commentCount`
   * 0 iken küçük ikona) dokununca bu çağrılır — üst bileşen thread sheet'i açar.
   * Viewer da açabilir (salt-okunur okuma), bu yüzden `canEdit`'ten bağımsızdır.
   * Optimistic satırda rozet gizlenir (madde henüz sunucuda yok).
   */
  onOpenComments?: () => void;
};

/**
 * Tek kontrol listesi maddesinin satırı (DEM-221). Üç aksiyon, satır-içi `x`
 * butonu yok:
 *
 * - **Checkbox'a dokun** → tamamla / geri al (dokunma bölgesi ~48dp).
 * - **Metne dokun** → madde düzenleme sheet'ini açar (`onEdit` — üst bileşen
 *   `ChecklistItemEditSheet`'i mount eder; maddeye yorum yazma akışıyla
 *   simetrik modal düzenleme, satır-içi `TextInput` yerine).
 * - **Sola kaydır** → kırmızı "Sil" (`SwipeRow`).
 *
 * Satır min 48dp — mobil dokunma hedefi standardı. Salt-okunur (`canEdit=false`)
 * ya da optimistic satırda kaydırma ve düzenleme devre dışı; bu durumda satır
 * `SwipeRow` olmadan çizilir.
 */
export function ChecklistItemRow({
  item,
  optimistic,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  onOpenComments,
}: ChecklistItemRowProps) {
  const theme = themeFor(useColorScheme());

  const interactive = canEdit && !optimistic;

  // Madde yorum rozeti — thread sheet'i açar. `onOpenComments` verilmeli
  // (yorum bağlamı) ve satır optimistic olmamalı (madde sunucuda). `commentCount
  // > 0` ise sayı görünür; 0 ise yalnız ikon (boş thread'i açıp ilk yorumu
  // yazmak için). 44×44 dokunma hedefi. `?? 0` defansif: eski/yarı yüklenmiş
  // cache satırında `commentCount` tanımsız olabilir (backend alanı yeni);
  // tanımsız → rozet sayısı gizli.
  const commentCount = item.commentCount ?? 0;
  const hasComments = commentCount > 0;
  const commentsBadge =
    onOpenComments && !optimistic ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.cardDetail.itemCommentsOpen}
        hitSlop={6}
        onPress={onOpenComments}
        className="h-11 min-w-11 flex-row items-center justify-center gap-1 px-1 active:opacity-60"
      >
        <Icon
          name="message-square"
          size={16}
          color={hasComments ? theme.primary : theme.mutedForeground}
        />
        {hasComments ? (
          <Text weight="medium" className="text-xs text-primary">
            {commentCount}
          </Text>
        ) : null}
      </Pressable>
    ) : null;

  const row = (
    <View className="min-h-12 flex-row items-start bg-card">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed, disabled: !interactive }}
        accessibilityLabel={item.content}
        disabled={!interactive}
        onPress={() => onToggle(!item.completed)}
        className="h-12 w-11 items-center justify-center active:opacity-60"
      >
        <Icon
          name={item.completed ? 'check-square' : 'square'}
          size={22}
          color={item.completed ? theme.success : theme.mutedForeground}
        />
      </Pressable>

      <Pressable
        accessibilityRole={interactive ? 'button' : undefined}
        accessibilityLabel={interactive ? strings.cardDetail.checklistItemEdit : undefined}
        disabled={!interactive}
        onPress={onEdit}
        className="min-h-12 flex-1 justify-center py-2.5 pr-1 active:opacity-60"
      >
        <Text
          className={`text-sm ${
            item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {item.content}
        </Text>
      </Pressable>

      {/* Madde yorum rozeti — `commentCount > 0` ise mesaj ikonu + sayı, 0 ise
          yalnız ikon (boş thread'i açıp ilk yorumu yazmak için). Optimistic
          satırda gizli (madde henüz sunucuda yok, thread çekilemez). Viewer da
          dokunabilir (salt-okunur thread). */}
      {commentsBadge}
    </View>
  );

  // Salt-okunur / optimistic satır — kaydırma yok, düz satır.
  if (!interactive) return row;

  return (
    <SwipeRow
      actions={[
        {
          key: 'delete',
          icon: 'trash-2',
          variant: 'destructive',
          label: strings.cardDetail.checklistDeleteAction,
          accessibilityLabel: strings.cardDetail.checklistItemDelete,
          onPress: onDelete,
        },
      ]}
    >
      {row}
    </SwipeRow>
  );
}
