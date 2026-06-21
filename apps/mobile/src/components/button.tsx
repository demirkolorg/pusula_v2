import { Pressable } from 'react-native';
import { Text } from '@/components/text';
import { AppSpinner } from '@/components/app-spinner';
import { useTheme } from '@/theme/theme-provider';

type ButtonVariant = 'primary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Async work in flight — gösterir spinner, basışı engeller. */
  pending?: boolean;
  disabled?: boolean;
};

/**
 * NativeWind tabanlı buton. `@pusula/ui` shadcn web bileşenleri mobilde
 * kullanılmaz (7.0 kararı) — mobil kendi bileşenlerini kurar.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  pending = false,
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || pending;
  const tone = variant === 'primary' ? 'bg-primary' : 'bg-transparent';
  const textTone = variant === 'primary' ? 'text-primary-foreground' : 'text-foreground';
  // Spinner rengi tema token'ından — `className` bunu render edemez.
  const spinnerColor = variant === 'primary' ? theme.primaryForeground : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: pending }}
      disabled={isDisabled}
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-lg px-4 ${tone} ${
        isDisabled ? 'opacity-50' : 'active:opacity-80'
      }`}
    >
      {pending ? <AppSpinner size="sm" color={spinnerColor} /> : null}
      <Text weight="semibold" className={`text-base ${textTone}`}>
        {label}
      </Text>
    </Pressable>
  );
}
