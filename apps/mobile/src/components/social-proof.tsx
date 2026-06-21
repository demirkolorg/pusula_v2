import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { paletteColors } from '@/theme/tokens';
import { useTheme } from '@/theme/theme-provider';

/**
 * Cam giriş kartının altındaki sosyal-proof şeridi — web `/sign-in`
 * `social-proof.tsx`'in mobil karşılığı: üst üste binmiş renkli avatar
 * daireleri + kısa "ekip Pusula kullanıyor" metni + beş yıldız.
 *
 * İçerik sahte/örnektir ({@link strings.auth.landing.socialProof}); avatar
 * renkleri `paletteColors`, yıldızlar `warning` tonunda. Avatar/yıldız satırları
 * dekoratiftir (ekran okuyucuya gizli). Açılışta yumuşak belirir; reduced-motion
 * açıksa statik. `Animated.View` yalnız `style` ile sürülür (className değil).
 */

/** Avatar dairesi tonları — `paletteColors` (web `--palet-*`). */
const AVATAR_TONES = ['mavi', 'yesil', 'turuncu', 'mor', 'pembe'] as const;

export function SocialProof() {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const copy = strings.auth.landing.socialProof;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.delay(200).duration(400)}
      style={{ alignItems: 'center', gap: 8 }}
    >
      {/* Üst üste binmiş avatar daireleri — saf süs. */}
      <View
        className="flex-row"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {AVATAR_TONES.map((tone, i) => (
          <View
            key={tone}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: paletteColors[tone],
              borderWidth: 2,
              borderColor: theme.background,
              marginLeft: i === 0 ? 0 : -8,
            }}
          />
        ))}
      </View>

      <Text className="text-center text-xs text-muted-foreground">{copy.text}</Text>

      {/* Beş yıldız — dekoratif. */}
      <View
        className="flex-row gap-0.5"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Icon key={i} name="star" size={14} color={theme.warning} />
        ))}
      </View>
    </Animated.View>
  );
}
