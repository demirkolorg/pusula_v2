import { useMemo } from 'react';
import { View } from 'react-native';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';
import { strings } from '@/lib/strings';
import { tintCompassAnimation } from '@/lib/compass-animation';

/** Web `AppSpinner` boyut ölçeğiyle hizalı (xs/sm/md/lg → 16/20/28/40 px). */
const spinnerSizes = { xs: 16, sm: 20, md: 28, lg: 40 } as const;

type AppSpinnerProps = {
  /** Erişilebilir durum etiketi; `showLabel` ile görünür metne de döner. */
  label?: string;
  /** Dönen ikonun yanında etiketi metin olarak göster (tam ekran yükleme). */
  showLabel?: boolean;
  size?: keyof typeof spinnerSizes;
  /** Compass dolgu rengi — verilmezse temaya göre soluk ön plan. */
  color?: string;
};

/**
 * Uygulama geneli yükleniyor göstergesi — web `AppSpinner` ile aynı "compass"
 * Lottie animasyonunu kullanır. Mobilde RN `ActivityIndicator` yerine bu
 * bileşen tercih edilir (web ile görsel tutarlılık).
 *
 * İki varyasyon: yalnız dönen ikon (varsayılan — satır içi / buton / küçük
 * alanlar) ve `showLabel` ile ikon + metin (tam ekran yükleme). Kaynak Lottie
 * tek renkli; `color` (verilmezse tema `mutedForeground`) `compass-animation`
 * helper'ıyla uygulanır — böylece koyu tema ve koyu overlay'lerde de görünür.
 */
export function AppSpinner({
  label = strings.common.loading,
  showLabel = false,
  size = 'md',
  color,
}: AppSpinnerProps) {
  const theme = useTheme();
  const tint = color ?? theme.mutedForeground;
  const animation = useMemo(() => tintCompassAnimation(tint), [tint]);
  const dimension = spinnerSizes[size];

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className="flex-row items-center justify-center gap-2"
    >
      <LottieView
        source={animation as unknown as AnimationObject}
        autoPlay
        loop
        style={{ width: dimension, height: dimension }}
      />
      {showLabel ? <Text className="text-sm text-muted-foreground">{label}</Text> : null}
    </View>
  );
}
