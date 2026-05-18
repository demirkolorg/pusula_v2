import { useState } from 'react';
import { Pressable, TextInput, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

type InlineComposerProps = {
  placeholder: string;
  /** Gönder butonu etiketi (örn. "Ekle" / "Kaydet"). */
  submitLabel: string;
  /** Başlangıç metni — yeniden adlandırmada mevcut başlık. */
  initialValue?: string;
  /** Boş-olmayan (trim'lenmiş) metinle çağrılır. Sonrasında alan temizlenir. */
  onSubmit: (text: string) => void;
  onCancel: () => void;
  /**
   * Vazgeç/x butonunu gizler — hep-açık (kapanmayan) hızlı-ekleme kullanımı
   * için. Verilmezse (varsayılan) buton render edilir; mevcut açıl/kapan
   * kullanımlar bozulmaz.
   */
  hideCancel?: boolean;
};

/**
 * Faz 7H — satır-içi metin composer'ı. Kart/liste oluşturmada ve liste yeniden
 * adlandırmada ortak: tek satır `TextInput` + gönder/vazgeç. NativeWind; metin
 * `strings`'ten okunur. Gönderdikten sonra alanı temizler — kart ekleme gibi
 * art arda kullanımda composer açık kalır (Trello deseni).
 */
export function InlineComposer({
  placeholder,
  submitLabel,
  initialValue = '',
  onSubmit,
  onCancel,
  hideCancel = false,
}: InlineComposerProps) {
  const theme = themeFor(useColorScheme());
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-2">
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        selectionColor={theme.primary}
        accessibilityLabel={placeholder}
        autoFocus
        blurOnSubmit={false}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
        style={{ fontFamily: defaultFontFamily }}
        className="min-h-10 rounded-md bg-background px-2 py-2 text-sm text-foreground"
      />
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={handleSubmit}
          className={`h-9 flex-1 items-center justify-center rounded-md bg-primary ${
            canSubmit ? 'active:opacity-80' : 'opacity-50'
          }`}
        >
          <Text weight="semibold" className="text-sm text-primary-foreground">
            {submitLabel}
          </Text>
        </Pressable>
        {hideCancel ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.common.cancel}
            hitSlop={8}
            onPress={onCancel}
            className="h-9 w-9 items-center justify-center rounded-md active:opacity-60"
          >
            <Icon name="x" size={18} color={theme.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
