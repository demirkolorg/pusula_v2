import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { resolveChecklistItemRename } from '@/lib/checklist-item-edit';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

type ChecklistItemEditSheetProps = {
  visible: boolean;
  /** Düzenlenen maddenin mevcut içeriği — taslak buradan tohumlanır. */
  initialContent: string;
  /** `update` mutation uçuşta mı — alan/butonlar kilitlenir. */
  pending: boolean;
  /** Kaydedilecek (kırpılmış, değişmiş, boş-olmayan) içerikle çağrılır. */
  onSave: (content: string) => void;
  onClose: () => void;
};

/**
 * Kontrol listesi maddesini **modal ile** yeniden adlandırma (DEM — 2026-06-20).
 * Önceki satır-içi `TextInput` düzenlemesi yerine, maddeye yorum yazma akışıyla
 * (`ChecklistItemThreadSheet`) simetrik bir bottom sheet/popover.
 *
 * Klavye yönetimi `Sheet`'in `KeyboardAvoidingView`'ından gelir (iOS `padding`)
 * — alan klavyenin altında kalmaz. Üst bileşen sheet'i `key={itemId}` ile mount
 * ettiğinden taslak her madde için `useState` tohumuyla tazelenir (effect yok).
 *
 * Boş ya da değişmemiş içerik `resolveChecklistItemRename` ile elenir → gereksiz
 * mutation atılmaz, sheet yine kapanır. İçerik çok satırlı (`multiline`, 2000
 * karaktere kadar — mobil düz-metin sınırı; backend 20 000'e izin verir ama mobil
 * kısa düz metin yazar, biçimli editör sonraki tur); kaydetme açık "Kaydet"
 * butonuyla (multiline'da `return` yeni satır ekler, gönderim yapmaz).
 */
export function ChecklistItemEditSheet({
  visible,
  initialContent,
  pending,
  onSave,
  onClose,
}: ChecklistItemEditSheetProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(initialContent);

  const submit = () => {
    const next = resolveChecklistItemRename(initialContent, draft);
    if (next !== null) onSave(next);
    onClose();
  };

  return (
    <Sheet visible={visible} title={strings.cardDetail.checklistItemEdit} onClose={onClose}>
      <View className="gap-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          multiline
          maxLength={2000}
          editable={!pending}
          placeholder={strings.cardDetail.checklistItemPlaceholder}
          placeholderTextColor={theme.mutedForeground}
          selectionColor={theme.primary}
          accessibilityLabel={strings.cardDetail.checklistItemEdit}
          // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
          // `textAlignVertical: top` Android'de çok satırlı metni üstten başlatır.
          style={{ fontFamily: defaultFontFamily, textAlignVertical: 'top' }}
          className="min-h-24 rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground"
        />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={strings.cardDetail.cancel}
              variant="ghost"
              onPress={onClose}
              disabled={pending}
            />
          </View>
          <View className="flex-1">
            <Button
              label={strings.cardDetail.save}
              onPress={submit}
              pending={pending}
              disabled={draft.trim().length === 0 || pending}
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}
