import { TextInput, View, useColorScheme } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Text } from '@/components/text';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

type TextAreaProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Üstte gösterilen alan etiketi (opsiyonel). */
  label?: string;
  /** Minimum yükseklik Tailwind sınıfı — varsayılan `min-h-24`. */
  minHeightClassName?: string;
} & Pick<TextInputProps, 'placeholder' | 'editable' | 'autoFocus'>;

/**
 * Çok satırlı metin girişi — NativeWind. `TextField` tek satırlık (`h-12`);
 * açıklama düzenleme ve yorum yazma gibi uzun metin alanları bunu kullanır.
 * Placeholder/imleç rengi tema token'ından okunur (`className` rengi render
 * etmez); `TextInput` `Text` olmadığından Poppins `style` ile uygulanır.
 */
export function TextArea({
  value,
  onChangeText,
  label,
  minHeightClassName = 'min-h-24',
  ...inputProps
}: TextAreaProps) {
  const theme = themeFor(useColorScheme());

  return (
    <View className="gap-1.5">
      {label ? (
        <Text weight="medium" className="text-sm text-foreground">
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
        placeholderTextColor={theme.mutedForeground}
        selectionColor={theme.primary}
        accessibilityLabel={label ?? inputProps.placeholder}
        style={{ fontFamily: defaultFontFamily }}
        className={`${minHeightClassName} rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground`}
        {...inputProps}
      />
    </View>
  );
}
