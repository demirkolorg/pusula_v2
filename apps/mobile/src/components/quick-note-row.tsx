import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Text } from '@/components/text';
import { InlineComposer } from '@/components/inline-composer';
import { SwipeRow } from '@/components/swipe-row';
import { isPendingId } from '@/lib/client-mutation-id';
import type { QuickNote } from '@/lib/use-quick-note-mutations';
import { strings } from '@/lib/strings';

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
  const [editing, setEditing] = useState(false);
  const pending = isPendingId(note.id);

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
    <View className="bg-card p-3">
      <Text className="text-sm text-foreground">{note.content}</Text>
    </View>
  );

  // Geçici (tmp-) not — sunucuda yok; kaydırmalı aksiyonlar kapalı, düz kart.
  if (pending) {
    return (
      <View className="overflow-hidden rounded-lg border border-border opacity-50">{card}</View>
    );
  }

  return (
    <View className="overflow-hidden rounded-lg border border-border">
      <SwipeRow
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
