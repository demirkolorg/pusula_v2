import { Switch as RNSwitch } from 'react-native';
import { useTheme } from '@/theme/theme-provider';

type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
};

/**
 * NativeWind tabanlı aç/kapa düğmesi — RN `Switch` sarmalayıcısı. `@pusula/ui`
 * shadcn web `Switch` mobilde kullanılmaz (7.0 kararı). Renkler tema
 * token'larından (RN `Switch` `className` ile boyanamaz).
 */
export function Toggle({ value, onValueChange, disabled = false, accessibilityLabel }: ToggleProps) {
  const theme = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      // İz (track) ve baş (thumb) renkleri: açıkken primary, kapalıyken muted.
      trackColor={{ false: theme.border, true: theme.primary }}
      thumbColor={theme.card}
      ios_backgroundColor={theme.border}
      style={disabled ? { opacity: 0.5 } : undefined}
    />
  );
}
