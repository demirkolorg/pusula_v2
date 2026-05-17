import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { themeFor } from '@/theme/tokens';
import { strings } from '@/lib/strings';

/** Tam ekran yükleniyor göstergesi — oturum çözülürken route layout'ları kullanır. */
export function LoadingScreen() {
  const theme = themeFor(useColorScheme());
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background">
      <ActivityIndicator color={theme.primary} />
      <Text className="text-sm text-muted-foreground">{strings.common.loading}</Text>
    </View>
  );
}
