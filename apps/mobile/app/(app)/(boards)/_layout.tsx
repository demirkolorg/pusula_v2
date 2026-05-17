import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { themeFor } from '@/theme/tokens';

/**
 * "Panolar" sekmesinin stack'i — workspace listesi (kök) → board listesi
 * (push, geri butonu otomatik). Native header tema token'larıyla stillenir.
 */
export default function BoardsLayout() {
  const theme = themeFor(useColorScheme());

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        headerTitleStyle: { color: theme.foreground },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
