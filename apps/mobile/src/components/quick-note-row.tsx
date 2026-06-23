import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { InlineComposer } from '@/components/inline-composer';
import { QuickNoteActionsSheet } from '@/components/quick-note-actions-sheet';
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
  /**
   * Satır-içi düzenleme açıldı/kapandı — parent (liste) bunu kullanıp düzenlenen
   * satırı görünür alana kaydırır (klavye satırı örtmesin). Verilmezse no-op.
   */
  onEditingChange?: (editing: boolean) => void;
};

/**
 * Hızlı Notlar ekranındaki tek not — "Saved Messages" baloncuk tasarımı.
 *
 * Notlar sağa yaslı sohbet baloncuğu olarak çizilir (kişisel hızlı-yakalama
 * hissi); baloncuğun altında göreli zaman + (varsa) "düzenlendi". Aksiyonlar
 * (Düzenle / Panoya taşı / Sil) baloncuğa **dokununca/uzun basınca** açılan
 * `QuickNoteActionsSheet` ile sunulur — önceki DEM-231 kaydırmalı (`SwipeRow`)
 * desen baloncuk tasarımıyla kaldırıldı (kullanıcı kararı). Düzenleme satır-içi
 * `InlineComposer` ile yapılır.
 *
 * Geçici (`tmp-`) id'li notlar henüz sunucuya yazılmamıştır — backend isteği
 * bulamayacağı için aksiyonlar kapatılır, baloncuk soluk çizilir (`isPendingId`
 * deseni — `board-column.tsx` / `quick-note-dock`).
 */
export function QuickNoteRow({
  note,
  onUpdate,
  onDelete,
  onConvert,
  onEditingChange,
}: QuickNoteRowProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pending = isPendingId(note.id);
  // Düzenlenmiş not — `updatedAt` `createdAt`'ten ileri ise meta'da "düzenlendi".
  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 1000;

  // Düzenleme aç/kapa — parent'a da bildir (görünür-alana kaydırma).
  const startEditing = () => {
    setEditing(true);
    onEditingChange?.(true);
  };
  const stopEditing = () => {
    setEditing(false);
    onEditingChange?.(false);
  };

  if (editing) {
    return (
      <InlineComposer
        placeholder={strings.quickNotes.editPlaceholder}
        submitLabel={strings.quickNotes.editSubmit}
        initialValue={note.content}
        onSubmit={(text) => {
          stopEditing();
          if (text !== note.content) onUpdate(text);
        }}
        onCancel={stopEditing}
      />
    );
  }

  // Aksiyon sheet'i başlığı — notun ilk satırı, kısaltılmış.
  const menuTitle = (note.content.split('\n')[0] ?? '').slice(0, 40) || strings.quickNotes.title;

  // Baloncuk + altında meta (zaman / düzenlendi). Sağa yaslı (gönderilen mesaj).
  const bubble = (
    <View className="items-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menuTitle}
        disabled={pending}
        onPress={() => setMenuOpen(true)}
        onLongPress={() => setMenuOpen(true)}
        className={`max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 active:opacity-90 ${
          pending ? 'opacity-50' : ''
        }`}
      >
        <Text className="text-[15px] leading-5 text-primary-foreground">{note.content}</Text>
      </Pressable>
      <View className="mt-1 flex-row items-center gap-1 pr-1">
        <Icon name="clock" size={11} color={theme.mutedForeground} />
        <Text className="text-[11px] text-muted-foreground">
          {formatRelativeTime(note.createdAt)}
        </Text>
        {edited ? (
          <Text className="text-[11px] text-muted-foreground">
            · {strings.quickNotes.editedSuffix}
          </Text>
        ) : null}
      </View>
    </View>
  );

  // Geçici (tmp-) not — sunucuda yok; yalnız soluk baloncuk, aksiyon yok.
  if (pending) return bubble;

  return (
    <>
      {bubble}
      <QuickNoteActionsSheet
        visible={menuOpen}
        title={menuTitle}
        onEdit={() => {
          setMenuOpen(false);
          startEditing();
        }}
        onConvert={() => {
          setMenuOpen(false);
          onConvert();
        }}
        onDelete={() => {
          setMenuOpen(false);
          setConfirmingDelete(true);
        }}
        onClose={() => setMenuOpen(false)}
      />
      {/* Silme onayı — native Alert yerine tema-uyumlu güzel onay sayfası. */}
      <ConfirmSheet
        visible={confirmingDelete}
        title={strings.quickNotes.deleteConfirmTitle}
        message={strings.quickNotes.deleteConfirmBody}
        confirmLabel={strings.quickNotes.deleteConfirmAction}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
}
