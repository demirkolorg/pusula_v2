import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/theme-provider';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Tek bir yumuşak blob — `blur-3xl` efektini simüle etmek için üç iç içe daire.
 * Merkeze yaklaştıkça opaklık birikir; kenara doğru doğal bir yoğunluk
 * azalması oluşur (radial gradient yerine CSS'siz yaklaşım).
 */
function Blob({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: size / 2,
          backgroundColor: hexToRgba(color, 0.08),
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: (size * 0.72) / 2,
          backgroundColor: hexToRgba(color, 0.12),
          top: size * 0.14,
          left: size * 0.14,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.44,
          height: size * 0.44,
          borderRadius: (size * 0.44) / 2,
          backgroundColor: hexToRgba(color, 0.16),
          top: size * 0.28,
          left: size * 0.28,
        }}
      />
    </View>
  );
}

const ease = Easing.inOut(Easing.sin);

/**
 * Animasyonlu aurora blob arka planı — web `/sign-in` ekranının
 * (`aurora-background.tsx`) mobil simetrisi. Üç büyük yumuşak blob Reanimated
 * ile yavaşça yüzer; `prefers-reduced-motion` açıksa hareketsiz kalır.
 *
 * Tamamen dekoratiftir: `pointerEvents="none"`, ekran okuyuculardan gizli.
 * `StyleSheet.absoluteFill` ile üst SafeAreaView'ı doldurur (z-index < içerik).
 */
export function AuroraBackground() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const b1x = useSharedValue(0);
  const b1y = useSharedValue(0);
  const b1s = useSharedValue(1);

  const b2x = useSharedValue(0);
  const b2y = useSharedValue(0);
  const b2s = useSharedValue(1);

  const b3x = useSharedValue(0);
  const b3y = useSharedValue(0);
  const b3s = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;

    // Blob 1 — ~26s, sol üst (web: x:[0,80,-40,0] y:[0,60,120,0])
    b1x.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 8700, easing: ease }),
        withTiming(-20, { duration: 8700, easing: ease }),
        withTiming(0, { duration: 8600, easing: ease }),
      ),
      -1,
    );
    b1y.value = withRepeat(
      withSequence(
        withTiming(30, { duration: 8700, easing: ease }),
        withTiming(60, { duration: 8700, easing: ease }),
        withTiming(0, { duration: 8600, easing: ease }),
      ),
      -1,
    );
    b1s.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 8700, easing: ease }),
        withTiming(0.95, { duration: 8700, easing: ease }),
        withTiming(1, { duration: 8600, easing: ease }),
      ),
      -1,
    );

    // Blob 2 — ~32s, sağ üst (web: x:[0,-70,30,0] y:[0,90,40,0])
    b2x.value = withRepeat(
      withSequence(
        withTiming(-35, { duration: 10700, easing: ease }),
        withTiming(15, { duration: 10700, easing: ease }),
        withTiming(0, { duration: 10600, easing: ease }),
      ),
      -1,
    );
    b2y.value = withRepeat(
      withSequence(
        withTiming(45, { duration: 10700, easing: ease }),
        withTiming(20, { duration: 10700, easing: ease }),
        withTiming(0, { duration: 10600, easing: ease }),
      ),
      -1,
    );
    b2s.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 10700, easing: ease }),
        withTiming(1.2, { duration: 10700, easing: ease }),
        withTiming(1, { duration: 10600, easing: ease }),
      ),
      -1,
    );

    // Blob 3 — ~28s, alt orta (web: x:[0,60,-80,0] y:[0,-50,30,0])
    b3x.value = withRepeat(
      withSequence(
        withTiming(30, { duration: 9350, easing: ease }),
        withTiming(-40, { duration: 9350, easing: ease }),
        withTiming(0, { duration: 9300, easing: ease }),
      ),
      -1,
    );
    b3y.value = withRepeat(
      withSequence(
        withTiming(-25, { duration: 9350, easing: ease }),
        withTiming(15, { duration: 9350, easing: ease }),
        withTiming(0, { duration: 9300, easing: ease }),
      ),
      -1,
    );
    b3s.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 9350, easing: ease }),
        withTiming(0.92, { duration: 9350, easing: ease }),
        withTiming(1, { duration: 9300, easing: ease }),
      ),
      -1,
    );
  }, [reduceMotion, b1x, b1y, b1s, b2x, b2y, b2s, b3x, b3y, b3s]);

  const anim1 = useAnimatedStyle(() => ({
    transform: [{ translateX: b1x.value }, { translateY: b1y.value }, { scale: b1s.value }],
  }));
  const anim2 = useAnimatedStyle(() => ({
    transform: [{ translateX: b2x.value }, { translateY: b2y.value }, { scale: b2s.value }],
  }));
  const anim3 = useAnimatedStyle(() => ({
    transform: [{ translateX: b3x.value }, { translateY: b3y.value }, { scale: b3s.value }],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Zemin — tema arka planı */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} />

      {/* Blob 1 — sol üst, ana marka tonu */}
      <Animated.View style={[{ position: 'absolute', top: -80, left: -70 }, anim1]}>
        <Blob color={theme.primary} size={300} />
      </Animated.View>

      {/* Blob 2 — sağ üst, koyu marka tonu */}
      <Animated.View style={[{ position: 'absolute', top: -60, right: -70 }, anim2]}>
        <Blob color={theme.primaryDark} size={260} />
      </Animated.View>

      {/* Blob 3 — alt orta, açık marka tonu */}
      <Animated.View style={[{ position: 'absolute', bottom: -100, left: '20%' }, anim3]}>
        <Blob color={theme.primary} size={340} />
      </Animated.View>
    </View>
  );
}
