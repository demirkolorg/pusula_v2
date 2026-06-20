import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { themeFor } from '@/theme/tokens';
import { AuroraBackground } from './aurora-background';
import { BrandMark } from './brand-mark';

type AuthScreenProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Auth ekranları için ortak kabuk — web `/sign-in` ekranıyla aynı tasarım dili:
 * Reanimated aurora blob arka planı + yarı saydam glassmorphic kart içinde
 * marka işareti, başlık ve form içeriği.
 *
 * `(auth)` grubundaki tüm ekranlar (sign-in, sign-up, forgot-password,
 * reset-password) bu kabuğu kullanır.
 */
export function AuthScreen({ title, subtitle, children }: AuthScreenProps) {
  const scheme = useColorScheme();
  const theme = themeFor(scheme);
  const isDark = scheme === 'dark';

  // Glassmorphic kart: web'deki `bg-card/70 backdrop-blur-xl border-border/60`
  // karşılığı — backdrop-blur RN'de expo-blur olmadan mevcut değil; biraz daha
  // opak tutarak okunabilirliği korur.
  const cardBg = isDark
    ? hexToRgba(theme.card, 0.88)
    : hexToRgba(theme.card, 0.92);
  const cardBorder = isDark
    ? hexToRgba(theme.border, 0.50)
    : hexToRgba(theme.borderSoft, 0.80);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }}>
      <AuroraBackground />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="mx-auto w-full max-w-sm">
            {/* Glassmorphic kart — web SignInGlassCard'ın mobil simetrisi */}
            <View
              style={{
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                paddingHorizontal: 24,
                paddingVertical: 28,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.18 : 0.10,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              {/* Marka + başlık */}
              <View className="mb-7 items-center gap-3">
                <BrandMark size={52} />
                <View className="items-center gap-1.5">
                  <Text weight="semibold" className="text-center text-2xl text-foreground">
                    {title}
                  </Text>
                  <Text className="text-center text-sm text-muted-foreground">{subtitle}</Text>
                </View>
              </View>

              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
