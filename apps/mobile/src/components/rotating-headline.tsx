import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';

/**
 * Giriş ekranı hero başlığı — web `/sign-in` `rotating-headline.tsx`'in mobil
 * karşılığı. Sabit ön/son metin arasında dönen tek bir vurgu kelimesi; kelime
 * her ~2.6 sn'de bir yumuşak (opacity + translateY) geçişle değişir.
 *
 * Erişilebilirlik: tüm hero TEK erişilebilir öğedir ve sabit, kararlı tam metni
 * ({@link strings.auth.landing.heroHeadlineFull}) duyurur — görünen dönen kelime
 * saf görsel efekttir, ekran okuyucu için anlam taşımaz.
 *
 * `prefers-reduced-motion` açıksa ({@link useReducedMotion}) kelime dönmez; ilk
 * kelime sabit kalır (aurora/glass-card ile aynı desen). `Animated.View` yalnız
 * `style` ile sürülür (className değil) — mobilde cssInterop üretimde kayıtlı
 * değil, className Animated bileşene sessizce uygulanmaz.
 */

/** Kelime değişim aralığı (ms) — okunacak kadar uzun, sıkıcı olmayacak kadar kısa. */
const ROTATE_INTERVAL_MS = 2600;
/** Tek yönlü geçiş süresi (ms). */
const FADE_MS = 300;
/** Dönen kelime satırının sabit yüksekliği — layout zıplamasını önler. */
const WORD_ROW_HEIGHT = 44;

export function RotatingHeadline() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.heroHeadline;
  const full = strings.auth.landing.heroHeadlineFull;
  const words = copy.rotatingWords;
  const [index, setIndex] = useState(0);

  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || words.length < 2) {
      // Reduce-motion oturum sırasında açılırsa donan kelimede kalmasın —
      // ilk kelimeye sıfırla (sabit, beklenen durum).
      setIndex(0);
      opacity.value = 1;
      translateY.value = 0;
      return;
    }

    // Yeni kelimeyi göster + aşağıdan yumuşakça belir (JS thread'de çalışır).
    const showNext = () => {
      setIndex((prev) => (prev + 1) % words.length);
      translateY.value = 8;
      opacity.value = 0;
      translateY.value = withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
    };

    // Mevcut kelimeyi yukarı kaydırıp solduktan sonra sonrakine geç.
    const advance = () => {
      translateY.value = withTiming(-8, { duration: FADE_MS, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(
        0,
        { duration: FADE_MS, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(showNext)();
        },
      );
    };

    const timer = setInterval(advance, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, words.length, opacity, translateY]);

  const activeWord = words[index] ?? words[0] ?? '';

  const wordStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View accessible accessibilityLabel={full} className="items-center gap-0.5">
      <Text weight="semibold" className="text-center text-3xl text-foreground">
        {copy.prefix}
      </Text>

      {/* Dönen kelime — sabit yükseklikli, taşmayı kesen satır. */}
      <View className="overflow-hidden" style={{ height: WORD_ROW_HEIGHT, justifyContent: 'center' }}>
        <Animated.View style={wordStyle}>
          <Text weight="semibold" className="text-center text-3xl text-primary">
            {activeWord}
          </Text>
        </Animated.View>
      </View>

      <Text weight="semibold" className="text-center text-3xl text-foreground">
        {copy.suffix}
      </Text>
    </View>
  );
}
