import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';

type RoleOption<T extends string> = {
  value: T;
  label: string;
};

type RoleSelectProps<T extends string> = {
  label: string;
  options: readonly RoleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/**
 * Yatay seçilebilir rol çipleri — davet formunda rol seçimi için. Native bir
 * picker yerine sade çip grubu (az seçenek: workspace 3, board 3). Seçili çip
 * primary tonunda; `className` rengi token'lardan okur.
 */
export function RoleSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: RoleSelectProps<T>) {
  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-sm text-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              className={`rounded-lg border px-3 py-2 ${
                selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
              } ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
            >
              <Text
                weight={selected ? 'semibold' : 'regular'}
                className={`text-sm ${selected ? 'text-primary' : 'text-foreground'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
