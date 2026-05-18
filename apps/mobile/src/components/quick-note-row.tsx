import { useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { isPendingId } from '@/lib/client-mutation-id';
import type { QuickNote } from '@/lib/use-quick-note-mutations';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type QuickNoteRowProps = {
  note: QuickNote;
  /** Düzenleme kaydedilince — boş-olmayan (trim'lenmiş) metinle çağrılır. */
  onUpdate: (content: string) => void;
  /** Silme onaylanınca çağrılır. */
  onDelete: () => void;
  /** "Panoya taşı" — not→kart dönüşümü picker'ını açar. */
  onConvert: () => void;
};

/**
 * Hızlı Notlar ekranındaki tek not satırı (DEM-203 WP3) — not metni + üç aksiyon
 * (düzenle / sil / panoya taşı). Düzenleme satır-içi `InlineComposer` ile yapılır.
 *
 * Geçici (`tmp-`) id'li notlar henüz sunucuya yazılmamıştır — backend isteği
 * bulamayacağı için aksiyonlar (düzenle/sil/dönüştür) sunucudan dönene kadar
 * kapatılır (kart satırı `isPendingId` deseni — `board-column.tsx`).
 */
export function QuickNoteRow({ note, onUpdate, onDelete, onConvert }: QuickNoteRowProps) {
  const theme = themeFor(useColorScheme());
  const [editing, setEditing] = useState(false);
  const pending = isPendingId(note.id);

  const handleDelete = () => {
    Alert.alert(
      strings.quickNotes.deleteConfirmTitle,
      strings.quickNotes.deleteConfirmBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.quickNotes.deleteConfirmAction,
          style: 'destructive',
          onPress: onDelete,
        },
      ],
      { cancelable: true },
    );
  };

  if (editing) {
    return (
      <InlineComposer
        placeholder={strings.quickNotes.editPlaceholder}
        submitLabel={strings.quickNotes.editSubmit}
        initialValue={note.content}
        onSubmit={(text) => {
          setEditing(false);
          if (text !== note.content) onUpdate(text);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <View
      className={`gap-3 rounded-lg border border-border bg-card p-3 ${
        pending ? 'opacity-50' : ''
      }`}
    >
      <Text className="text-sm text-foreground">{note.content}</Text>
      <View className="flex-row items-center gap-2">
        <RowAction
          icon="edit-3"
          label={strings.quickNotes.editAction}
          disabled={pending}
          onPress={() => setEditing(true)}
          tint={theme.mutedForeground}
        />
        <RowAction
          icon="trash-2"
          label={strings.quickNotes.deleteAction}
          disabled={pending}
          onPress={handleDelete}
          tint={theme.destructive}
        />
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.quickNotes.convertAction}
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onConvert}
          className={`h-9 flex-row items-center gap-2 rounded-md bg-primary px-3 ${
            pending ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          <Icon name="arrow-right-circle" size={16} color={theme.primaryForeground} />
          <Text weight="semibold" className="text-sm text-primary-foreground">
            {strings.quickNotes.convertAction}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** İkon-yuvarlağı sekonder aksiyon (düzenle / sil). */
function RowAction({
  icon,
  label,
  disabled,
  onPress,
  tint,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
  tint: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-md border border-border bg-background active:opacity-60"
    >
      <Icon name={icon} size={16} color={tint} />
    </Pressable>
  );
}
