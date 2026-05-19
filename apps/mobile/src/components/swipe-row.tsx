import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { themeFor } from '@/theme/tokens';

/** Tek bir aksiyon yüzeyinin genişliği (px). */
const ACTION_WIDTH = 84;
/** Pan jestinin sahiplenmesi için gereken yatay hareket eşiği (px). */
const ACTIVATE_DX = 12;
/** Bu yatay-dikey kaymada jest dikey kaydırmaya bırakılır (px). */
const FAIL_DY = 12;
/** Bu hızın üstünde bırakma "fling" sayılır — mesafe yerine yön belirler. */
const FLING_VELOCITY = 400;
/** Settle (yerine oturma) animasyon süresi (ms). */
const SETTLE_DURATION = 160;

/** Sola kaydırınca açılan tek bir aksiyon. */
export type SwipeAction = {
  /** React liste anahtarı. */
  key: string;
  /** Aksiyon yüzeyindeki görünür kısa etiket (örn. "Sil", "Düzenle"). */
  label: string;
  /** Erişilebilirlik etiketi (örn. "Maddeyi sil"). */
  accessibilityLabel: string;
  icon: IconName;
  /** Renk teması — `destructive` (kırmızı) yıkıcı aksiyon, `primary` diğerleri. */
  variant: 'destructive' | 'primary';
  /** Dokununca — satır önce kapanır, sonra çağrılır. */
  onPress: () => void;
};

type SwipeRowProps = {
  children: ReactNode;
  /** Sola kaydırınca açılan aksiyon(lar) — soldan sağa bu sırayla. En az 1. */
  actions: SwipeAction[];
  /** `false` → kaydırma devre dışı (örn. satır-içi düzenleme açıkken). */
  enabled?: boolean;
};

/**
 * Yatay kaydırılabilir satır (DEM-221; DEM-228 ile UI-thread'e taşındı; DEM-231
 * ile çok-aksiyonlu) — bir satırı saran, sola kaydırınca arkadan bir veya daha
 * fazla aksiyon yüzeyini açan kapsayıcı. Olgun mobil task uygulamalarının
 * (Apple Reminders / Todoist) satır-içi buton yerine jest arkasına saklama
 * deseni. Tek aksiyon (kart detayı sil) ya da üç aksiyon (Hızlı Notlar:
 * düzenle / taşı / sil) aynı bileşenle çizilir — `actions` dizisi.
 *
 * Kaydırma `react-native-gesture-handler` `Gesture.Pan()` + `react-native-
 * reanimated` `useSharedValue`/`useAnimatedStyle` ile yazılır — sürükleme
 * tamamen **UI-thread'inde** koşar. Pan jesti `activeOffsetX` ile yalnız
 * belirgin **yatay** hareket başladığında etkinleşir ve `failOffsetY` ile
 * dikey kayma baskın olunca bırakılır — böylece içinde bulunduğu dikey
 * `ScrollView`'un scroll'u ve pull-to-refresh'i bozulmaz. Açık satıra
 * içerikten dokununca satır kapanır (aksiyon yanlışlıkla tetiklenmesin).
 */
export function SwipeRow({ children, actions, enabled = true }: SwipeRowProps) {
  const theme = themeFor(useColorScheme());
  // Açılan toplam aksiyon paneli genişliği — aksiyon sayısıyla ölçeklenir.
  const panelWidth = actions.length * ACTION_WIDTH;
  // Satırın yatay konumu (px, ≤ 0). `translateX` UI-thread'inde okunur/yazılır.
  const translateX = useSharedValue(0);
  // Jest başlangıcında satırın o anki konumu (kapalı 0 / açık -panelWidth).
  const startX = useSharedValue(0);
  const [open, setOpen] = useState(false);

  // Açık/kapalı durumunu JS-thread state'ine yansıtır (içerik üstü kapama
  // `Pressable`'ı bu state'e bağlı). Worklet'ten `runOnJS` ile çağrılır.
  const syncOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  // Belirli bir hedefe yumuşakça oturt + JS state'ini güncelle. JS-thread'den
  // (`useEffect`, aksiyon butonu) çağrılır; `withTiming` animasyonu UI-thread'de.
  const settle = useCallback(
    (shouldOpen: boolean) => {
      translateX.value = withTiming(shouldOpen ? -panelWidth : 0, {
        duration: SETTLE_DURATION,
      });
      setOpen(shouldOpen);
    },
    [translateX, panelWidth],
  );

  // Kaydırma devre dışı bırakılırsa (örn. satır-içi düzenleme açıldı) açık
  // satırı kapat — aksi halde içerik kaymış, arkasında aksiyon yok kalırdı.
  useEffect(() => {
    if (!enabled && open) settle(false);
  }, [enabled, open, settle]);

  // Pan jesti — yalnız yatay hareket baskınken etkinleşir, dikey kaymada
  // bırakılır. `enabled=false` iken jest hiç başlamaz. `useMemo` ile sarılır:
  // aksi halde her render'da yeni `Gesture.Pan()` üretilir ve yoğun listede
  // (yorum listesi) her satır her render'da jesti yeniden bağlardı. Worklet'ler
  // `translateX`/`startX` shared value'larını kapatır (stabil referans);
  // `enabled` ve `open` JS değerleri bağımlılık dizisine girer.
  const panGesture = useMemo(() => {
    const clampOffset = (value: number): number => {
      'worklet';
      return Math.min(0, Math.max(-panelWidth, value));
    };
    return Gesture.Pan()
      .enabled(enabled)
      .activeOffsetX([-ACTIVATE_DX, ACTIVATE_DX])
      .failOffsetY([-FAIL_DY, FAIL_DY])
      .onBegin(() => {
        startX.value = translateX.value;
      })
      .onUpdate((event) => {
        translateX.value = clampOffset(startX.value + event.translationX);
      })
      .onEnd((event) => {
        const offset = clampOffset(startX.value + event.translationX);
        // Hızlı bırakmada (fling) mesafe değil yön belirler; aksi halde
        // satır yarıdan fazla açıldıysa açık kalır.
        const shouldOpen =
          Math.abs(event.velocityX) > FLING_VELOCITY
            ? event.velocityX < 0
            : offset <= -panelWidth / 2;
        translateX.value = withTiming(shouldOpen ? -panelWidth : 0, {
          duration: SETTLE_DURATION,
        });
        runOnJS(syncOpen)(shouldOpen);
      })
      // Jest fail/cancel olursa (kullanıcı yatay kaydırırken dikey scroll
      // devralırsa) satırı mevcut `open` durumuna geri oturt — eski
      // `PanResponder` `onPanResponderTerminate` paritesi.
      .onFinalize((_event, success) => {
        'worklet';
        if (!success) {
          translateX.value = withTiming(open ? -panelWidth : 0, {
            duration: SETTLE_DURATION,
          });
        }
      });
  }, [enabled, open, panelWidth, startX, translateX, syncOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View className="overflow-hidden">
      {enabled ? (
        <View
          className="absolute bottom-0 right-0 top-0 flex-row"
          style={{ width: panelWidth }}
        >
          {actions.map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              onPress={() => {
                settle(false);
                action.onPress();
              }}
              style={{
                width: ACTION_WIDTH,
                backgroundColor:
                  action.variant === 'destructive' ? theme.destructive : theme.primary,
              }}
              className="items-center justify-center gap-1 active:opacity-80"
            >
              <Icon name={action.icon} size={18} color="#ffffff" />
              <Text weight="medium" className="text-xs" style={{ color: '#ffffff' }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ backgroundColor: theme.card }, animatedStyle]}>
          {children}
          {open ? (
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={() => settle(false)}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
