import { Text, TextInput, View, useColorScheme } from 'react-native';
import type { TextInputProps } from 'react-native';
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
>;

/**
 * Etiketli metin girişi — NativeWind. Placeholder/imleç rengi tema token'ından
 * (`useColorScheme` ile light/dark) okunur; `className` rengi render etmez.
 */
export function TextField({ label, value, onChangeText, error, ...inputProps }: TextFieldProps) {
  const theme = themeFor(useColorScheme());

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.mutedForeground}
        selectionColor={theme.primary}
        accessibilityLabel={label}
        className={`h-12 rounded-lg border bg-card px-3 text-base text-foreground ${
          error ? 'border-destructive' : 'border-border'
        }`}
        {...inputProps}
      />
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
