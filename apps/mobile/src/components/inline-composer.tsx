import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

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
  /**
   * Yükseltilmiş (kart) görünüm — `rounded-2xl`, hafif gölge ve odakta
   * `primary` kenarlık. Hızlı Notlar composer'ı için (modern görünüm). Verilmezse
   * (varsayılan) düz `rounded-lg` kart — mevcut kart/liste oluşturma kullanımları
   * görsel olarak değişmez.
   */
  elevated?: boolean;
  /**
   * Gönder butonundaki opsiyonel ikon (etiketin soluna gelir, örn. `arrow-up`).
   * Verilmezse yalnız etiket gösterilir (mevcut davranış).
   */
  submitIcon?: IconName;
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
  elevated = false,
  submitIcon,
}: InlineComposerProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue('');
  };

  // Yükseltilmiş kart: `rounded-2xl` + hafif gölge; odakta `primary` kenarlık.
  // Düz (varsayılan): mevcut `rounded-lg border-border` görünümü korunur.
  const containerClassName = elevated
    ? `gap-2 rounded-2xl border bg-card p-3 ${focused ? 'border-primary' : 'border-border'}`
    : 'gap-2 rounded-lg border border-border bg-card p-2';
  const containerStyle = elevated
    ? {
        shadowColor: '#000',
        shadowOpacity: focused ? 0.1 : 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }
    : undefined;
  const submitHeightClassName = elevated ? 'h-11' : 'h-9';
  const submitRadiusClassName = elevated ? 'rounded-xl' : 'rounded-md';

  return (
    <View className={containerClassName} style={containerStyle}>
      <TextInput
        value={value}
        onChangeText={setValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
          className={`${submitHeightClassName} ${submitRadiusClassName} flex-1 flex-row items-center justify-center gap-1.5 bg-primary ${
            canSubmit ? 'active:opacity-80' : 'opacity-50'
          }`}
        >
          {submitIcon ? (
            <Icon name={submitIcon} size={16} color={theme.primaryForeground} />
          ) : null}
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
