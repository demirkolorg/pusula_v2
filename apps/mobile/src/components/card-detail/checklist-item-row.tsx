import { useRef, useState } from 'react';
import { Pressable, TextInput, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Icon } from '@/components/icon';
import { SwipeRow } from '@/components/swipe-row';
import { Text } from '@/components/text';
import { resolveChecklistItemRename } from '@/lib/checklist-item-edit';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

type ChecklistItem = RouterOutputs['checklist']['list'][number]['items'][number];

type ChecklistItemRowProps = {
  item: ChecklistItem;
  /** Henüz sunucuda olmayan optimistic satır mı — etkileşim devre dışı. */
  optimistic: boolean;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
  onToggle: (completed: boolean) => void;
  onRename: (content: string) => void;
  onDelete: () => void;
};

/**
 * Tek kontrol listesi maddesinin satırı (DEM-221). Üç aksiyon, satır-içi `x`
 * butonu yok:
 *
 * - **Checkbox'a dokun** → tamamla / geri al (dokunma bölgesi ~48dp).
 * - **Metne dokun** → satır-içi yeniden adlandırma (`TextInput`'a dönüşür;
 *   `onSubmitEditing` / `onBlur` kaydeder — boş ya da değişmemiş içerik
 *   mutation atmaz, `resolveChecklistItemRename`).
 * - **Sola kaydır** → kırmızı "Sil" (`SwipeRow`).
 *
 * Satır min 48dp — mobil dokunma hedefi standardı. Salt-okunur (`canEdit=false`)
 * ya da optimistic satırda kaydırma ve yeniden adlandırma devre dışı; bu durumda
 * satır `SwipeRow` olmadan çizilir.
 */
export function ChecklistItemRow({
  item,
  optimistic,
  canEdit,
  onToggle,
  onRename,
  onDelete,
}: ChecklistItemRowProps) {
  const theme = themeFor(useColorScheme());
  const [editing, setEditing] = useState(false);
  // Düzenleme açılınca `startEdit` taslağı `item.content`'ten tazeler. Düzenleme
  // *açıkken* madde başka bir istemciden değişirse (realtime) taslak eskiyi
  // tutar; kaydetme `item.content` (güncel sunucu değeri) ile karşılaştırır —
  // bilinçli son-yazan-kazanır davranışı (mobil realtime: tam canlı senkron yok).
  const [draft, setDraft] = useState(item.content);
  // `onSubmitEditing` + `onBlur` art arda tetiklenir; ikinci `commitEdit`
  // `setEditing(false)` daha flush olmadan girebilir — çift mutation'ı
  // senkron bir ref bayrağıyla engelle.
  const committedRef = useRef(false);

  const interactive = canEdit && !optimistic;

  const startEdit = () => {
    if (!interactive) return;
    committedRef.current = false;
    setDraft(item.content);
    setEditing(true);
  };

  const commitEdit = () => {
    if (!editing || committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    if (!interactive) return;
    const next = resolveChecklistItemRename(item.content, draft);
    if (next !== null) onRename(next);
  };

  const row = (
    <View className="min-h-12 flex-row items-center bg-card">
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

      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commitEdit}
          onSubmitEditing={commitEdit}
          autoFocus
          returnKeyType="done"
          maxLength={2000}
          accessibilityLabel={strings.cardDetail.checklistItemEdit}
          selectionColor={theme.primary}
          // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
          style={{ fontFamily: defaultFontFamily }}
          className="h-12 flex-1 pr-1 text-sm text-foreground"
        />
      ) : (
        <Pressable
          accessibilityRole={interactive ? 'button' : undefined}
          accessibilityLabel={interactive ? strings.cardDetail.checklistItemEdit : undefined}
          disabled={!interactive}
          onPress={startEdit}
          className="h-12 flex-1 justify-center pr-1 active:opacity-60"
        >
          <Text
            className={`text-sm ${
              item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {item.content}
          </Text>
        </Pressable>
      )}
    </View>
  );

  // Salt-okunur / optimistic satır — kaydırma yok, düz satır.
  if (!interactive) return row;

  return (
    <SwipeRow
      onDelete={onDelete}
      deleteLabel={strings.cardDetail.checklistDeleteAction}
      deleteAccessibilityLabel={strings.cardDetail.checklistItemDelete}
      // Satır-içi düzenleme açıkken kaydırma devre dışı.
      enabled={!editing}
    >
      {row}
    </SwipeRow>
  );
}
