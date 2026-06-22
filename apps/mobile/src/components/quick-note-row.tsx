import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { SwipeRow } from '@/components/swipe-row';
import { isPendingId } from '@/lib/client-mutation-id';
import { formatRelativeTime } from '@/lib/format-date';
import type { QuickNote } from '@/lib/use-quick-note-mutations';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

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
 * Hızlı Notlar ekranındaki tek not satırı (DEM-203; DEM-231 ile kaydırmalı).
 *
 * Satır-içi buton kalabalığı (düzenle / sil / "Panoya taşı") DEM-231 ile
 * kaldırıldı — satır **sola kaydırılınca** arkadan üç aksiyon açılır
 * (`SwipeRow`): Düzenle / Taşı / Sil. App genelinde kaydırma yönü kuralı
 * (DEM-221 checklist, DEM-224 yorum) korunur. Düzenleme satır-içi
 * `InlineComposer` ile yapılır.
 *
 * Geçici (`tmp-`) id'li notlar henüz sunucuya yazılmamıştır — backend isteği
 * bulamayacağı için kaydırma kapatılır, satır düz çizilir (`isPendingId`
 * deseni — `board-column.tsx` / `quick-note-dock`).
 */
export function QuickNoteRow({ note, onUpdate, onDelete, onConvert }: QuickNoteRowProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const pending = isPendingId(note.id);
  // Düzenlenmiş not — `updatedAt` `createdAt`'ten ileri ise meta'da "düzenlendi".
  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 1000;

  const confirmDelete = () => {
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

  const card = (
    <View className="gap-1.5 bg-card px-4 py-3.5">
      <Text numberOfLines={4} className="text-[15px] text-foreground">
        {note.content}
      </Text>
      {/* Meta satırı — göreli oluşturulma zamanı + (varsa) "düzenlendi" rozeti. */}
      <View className="flex-row items-center gap-1.5">
        <Icon name="clock" size={12} color={theme.mutedForeground} />
        <Text className="text-xs text-muted-foreground">{formatRelativeTime(note.createdAt)}</Text>
        {edited ? (
          <Text className="text-xs text-muted-foreground">· {strings.quickNotes.editedSuffix}</Text>
        ) : null}
      </View>
    </View>
  );

  // Geçici (tmp-) not — sunucuda yok; kaydırmalı aksiyonlar kapalı, düz kart.
  if (pending) {
    return (
      <View className="overflow-hidden rounded-2xl border border-border opacity-50">{card}</View>
    );
  }

  return (
    <View className="overflow-hidden rounded-2xl border border-border">
      <SwipeRow
        rounded
        actions={[
          {
            key: 'edit',
            icon: 'edit-3',
            variant: 'primary',
            label: strings.quickNotes.editShort,
            accessibilityLabel: strings.quickNotes.editAction,
            onPress: () => setEditing(true),
          },
          {
            key: 'convert',
            icon: 'arrow-right-circle',
            variant: 'primary',
            label: strings.quickNotes.convertShort,
            accessibilityLabel: strings.quickNotes.convertAction,
            onPress: onConvert,
          },
          {
            key: 'delete',
            icon: 'trash-2',
            variant: 'destructive',
            label: strings.quickNotes.deleteConfirmAction,
            accessibilityLabel: strings.quickNotes.deleteAction,
            onPress: confirmDelete,
          },
        ]}
      >
        {card}
      </SwipeRow>
    </View>
  );
}
