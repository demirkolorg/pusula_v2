import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { useIsTablet } from '@/lib/use-device-class';
import { useTheme } from '@/theme/theme-provider';
import { AuroraBackground } from './aurora-background';
import { BrandMark } from './brand-mark';

type AuthScreenProps = {
  /** Kart içi başlık — `hero` verilmediğinde BrandMark altında render edilir. */
  title?: string;
  /** Kart içi alt başlık — `hero` verilmediğinde başlık altında render edilir. */
  subtitle?: string;
  /**
   * Kartın ÜSTÜNDE, kart dışında render edilen zengin hero içeriği (örn. marka
   * işareti + dönen başlık). Verilirse kart içi BrandMark/title/subtitle bloğu
   * gösterilmez — başlık sorumluluğu hero'ya geçer. Yalnız giriş ekranı kullanır.
   */
  hero?: ReactNode;
  /**
   * Kartın ALTINDA, `max-w-sm` kısıtı DIŞINDA (tam genişlik) render edilen
   * dekoratif içerik (örn. sosyal kanıt + board mockup). Board mockup'ın nefes
   * alması için geniş alan verir. Yalnız giriş ekranı kullanır.
   */
  belowCard?: ReactNode;
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
 *
 * Yerleşim, web `/sign-in`'in responsive davranışını izler:
 *  - **Tablet (≥768px) + hero**: iki kolon — solda hero (marka + dönen başlık),
 *    sağda form kartı; altında tam genişlik board mockup/sosyal kanıt.
 *    (web `lg:flex-row` hero düzeni.)
 *  - **Telefon / hero yok**: tek kolon dikey istif (hero → kart → belowCard).
 */
export function AuthScreen({ title, subtitle, hero, belowCard, children }: AuthScreenProps) {
  const scheme = useColorScheme();
  const theme = useTheme();
  const isDark = scheme === 'dark';
  const isTablet = useIsTablet();
  // İki kolon yalnız tablette VE hero verildiğinde (yani giriş ekranı). Diğer
  // auth ekranları her cihazda tek kolon, form-merkezli kalır.
  const twoColumn = isTablet && Boolean(hero);

  // Glassmorphic kart: web'deki `bg-card/70 backdrop-blur-xl border-border/60`
  // karşılığı — backdrop-blur RN'de expo-blur olmadan mevcut değil; biraz daha
  // opak tutarak okunabilirliği korur.
  const cardBg = isDark
    ? hexToRgba(theme.card, 0.88)
    : hexToRgba(theme.card, 0.92);
  const cardBorder = isDark
    ? hexToRgba(theme.border, 0.50)
    : hexToRgba(theme.borderSoft, 0.80);

  // Glassmorphic kart — hem tek kolon hem iki kolon düzeninde aynı bileşen.
  const card = (
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
        shadowOpacity: isDark ? 0.18 : 0.1,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      {/* Kart başlığı. BrandMark yalnız hero YOKKEN gösterilir (hero modda
          marka işareti hero'da). title/subtitle her iki modda da korunur —
          "Tekrar hoş geldiniz" gibi kart başlığı hero'yla birlikte de anlamlı
          (web'de de kartın kendi başlığı vardır). */}
      {hero && !title && !subtitle ? null : (
        <View className="mb-7 items-center gap-3">
          {hero ? null : <BrandMark size={52} />}
          {title || subtitle ? (
            <View className="items-center gap-1.5">
              {title ? (
                <Text weight="semibold" className="text-center text-2xl text-foreground">
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text className="text-center text-sm text-muted-foreground">{subtitle}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {children}
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }}>
      <AuroraBackground />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName={
            twoColumn
              ? 'flex-grow justify-center px-10 py-14'
              : 'flex-grow justify-center px-6 py-10'
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {twoColumn ? (
            // ── Tablet: iki kolon (web `lg:flex-row` hero düzeni) ──
            <View style={{ width: '100%', maxWidth: 980, alignSelf: 'center' }}>
              <View className="flex-row items-center gap-10">
                {/* Sol kolon — hero (marka + dönen başlık). */}
                <View className="flex-1">{hero}</View>
                {/* Sağ kolon — sabit genişlikli form kartı. */}
                <View style={{ width: 400 }}>{card}</View>
              </View>

              {/* Alt — tam genişlik dekoratif içerik (sosyal kanıt + board mockup). */}
              {belowCard ? <View className="mt-12 w-full">{belowCard}</View> : null}
            </View>
          ) : (
            // ── Telefon / hero yok: tek kolon dikey istif ──
            <View className="mx-auto w-full max-w-sm">
              {hero ? <View className="mb-8">{hero}</View> : null}
              {card}
              {belowCard ? <View className="mt-10 w-full">{belowCard}</View> : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
