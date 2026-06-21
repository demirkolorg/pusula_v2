import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { avatarColor, avatarInitial } from '@/lib/avatar-color';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Cam giriş kartının altındaki sosyal-proof şeridi — web `/sign-in`
 * `social-proof.tsx`'in mobil karşılığı: üst üste binmiş ekip üyesi avatarları
 * + kısa "ekip Pusula kullanıyor" metni + beş yıldız.
 *
 * İçerik sahte/örnektir ({@link strings.auth.landing.socialProof}); avatar
 * rengi + baş harfi örnek adlardan `avatarColor`/`avatarInitial` ile
 * deterministik türetilir (uygulamanın genel avatar mantığıyla aynı), yıldızlar
 * `warning` tonunda. Avatar/yıldız satırları dekoratiftir (ekran okuyucuya
 * gizli). Açılışta yumuşak belirir; reduced-motion açıksa statik.
 * `Animated.View` yalnız `style` ile sürülür (className değil).
 */
export function SocialProof() {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const copy = strings.auth.landing.socialProof;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.delay(200).duration(400)}
      style={{ alignItems: 'center', gap: 8 }}
    >
      {/* Üst üste binmiş ekip üyesi avatarları — saf süs. */}
      <View
        className="flex-row"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {copy.members.map((name, i) => (
          <View
            key={name}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: avatarColor(name),
              borderWidth: 2,
              borderColor: theme.background,
              marginLeft: i === 0 ? 0 : -8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text weight="semibold" className="text-white" style={{ fontSize: 12 }}>
              {avatarInitial(name)}
            </Text>
          </View>
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
