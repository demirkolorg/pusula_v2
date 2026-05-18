import { View } from 'react-native';
import { Text } from '@/components/text';

type FormMessageProps = {
  tone?: 'error' | 'info';
  children: string;
};

/** Form geneli bilgi/hata kutusu — NativeWind. */
export function FormMessage({ tone = 'error', children }: FormMessageProps) {
  const box =
    tone === 'error' ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted';
  const text = tone === 'error' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <View className={`rounded-lg border px-3 py-2.5 ${box}`} accessibilityRole="alert">
      <Text className={`text-sm ${text}`}>{children}</Text>
    </View>
  );
}
