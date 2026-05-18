import { TextInput, View, useColorScheme } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Text } from '@/components/text';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Alan altındaki doğrulama hatası (varsa). */
  error?: string;
} & Pick<
  TextInputProps,
  | 'placeholder'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'keyboardType'
  | 'secureTextEntry'
  | 'textContentType'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'editable'
  | 'autoFocus'
>;

/**
 * Etiketli metin girişi — NativeWind. Placeholder/imleç rengi tema token'ından
 * (`useColorScheme` ile light/dark) okunur; `className` rengi render etmez.
 */
export function TextField({ label, value, onChangeText, error, ...inputProps }: TextFieldProps) {
  const theme = themeFor(useColorScheme());

  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-sm text-foreground">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.mutedForeground}
        selectionColor={theme.primary}
        accessibilityLabel={label}
        // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
        style={{ fontFamily: defaultFontFamily }}
        className={`h-12 rounded-lg border bg-card px-3 text-base text-foreground ${
          error ? 'border-destructive' : 'border-border'
        }`}
        {...inputProps}
      />
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
