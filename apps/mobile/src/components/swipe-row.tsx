import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  type PanResponderInstance,
} from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { themeFor } from '@/theme/tokens';

/** Sola kaydırınca açılan sil aksiyon yüzeyinin genişliği (px). */
const ACTION_WIDTH = 84;
/** Bu eşikten fazla kaydırılınca satır açık kalır; altında kapanır (px). */
const OPEN_THRESHOLD = ACTION_WIDTH / 2;
/** PanResponder'ın jesti sahiplenmesi için gereken yatay hareket (px). */
const CLAIM_DX = 12;
/** Bu hızın üstünde bırakma "fling" sayılır — mesafe yerine yön belirler. */
const FLING_VELOCITY = 0.4;

type SwipeRowProps = {
  children: ReactNode;
  /** Sil aksiyonu — satır önce kapanır, sonra çağrılır. */
  onDelete: () => void;
  /** Sil aksiyonunun görünür etiketi (örn. "Sil"). */
  deleteLabel: string;
  /** Sil aksiyonunun erişilebilirlik etiketi (örn. "Maddeyi sil"). */
  deleteAccessibilityLabel: string;
  /** `false` → kaydırma devre dışı (örn. satır-içi düzenleme açıkken). */
  enabled?: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Yatay kaydırılabilir satır (DEM-221) — bir satırı saran, sola kaydırınca
 * arkadan kırmızı "Sil" aksiyon yüzeyini açan kapsayıcı. Olgun mobil task
 * uygulamalarının (Apple Reminders / Todoist) satır-içi yıkıcı buton yerine
 * jest arkasına saklama deseni.
 *
 * RN yerleşik `Animated` + `PanResponder` ile yazılır — yeni native bağımlılık
 * yok (`react-native-gesture-handler` eklenmez; DEM-217 `RemoteImage` / 7G-2
 * "yeni native bağımlılık yok" presedanı). `PanResponder` jesti **yalnız yatay
 * hareket** baskınken sahiplenir; böylece içinde bulunduğu dikey `ScrollView`'un
 * scroll'u ve pull-to-refresh'i bozulmaz. Açık satıra içerikten dokununca satır
 * kapanır (yıkıcı aksiyon yanlışlıkla tetiklenmesin).
 */
export function SwipeRow({
  children,
  onDelete,
  deleteLabel,
  deleteAccessibilityLabel,
  enabled = true,
}: SwipeRowProps) {
  const theme = themeFor(useColorScheme());
  const translateX = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  // PanResponder bir kez kurulur; geri çağrıları yalnızca kararlı referansları
  // (`ctx`, `translateX`, kararlı `settle`) kapatır — render başına değişen
  // prop'lar `ctx` üzerinden okunur (bayat closure önlenir).
  const ctx = useRef({ open: false, enabled, startX: 0 }).current;
  ctx.enabled = enabled;

  const settle = useCallback(
    (shouldOpen: boolean) => {
      ctx.open = shouldOpen;
      setOpen(shouldOpen);
      Animated.timing(translateX, {
        toValue: shouldOpen ? -ACTION_WIDTH : 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
    },
    [ctx, translateX],
  );

  // Kaydırma devre dışı bırakılırsa (örn. satır-içi düzenleme açıldı) açık
  // satırı kapat — aksi halde içerik kaymış, arkasında aksiyon yok kalırdı.
  useEffect(() => {
    if (!enabled && ctx.open) settle(false);
  }, [enabled, ctx, settle]);

  const responderRef = useRef<PanResponderInstance | null>(null);
  if (!responderRef.current) {
    responderRef.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        ctx.enabled &&
        Math.abs(gesture.dx) > CLAIM_DX &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        ctx.startX = ctx.open ? -ACTION_WIDTH : 0;
      },
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(clamp(ctx.startX + gesture.dx, -ACTION_WIDTH, 0));
      },
      onPanResponderRelease: (_event, gesture) => {
        const offset = clamp(ctx.startX + gesture.dx, -ACTION_WIDTH, 0);
        // Hızlı bırakmada (fling) mesafe değil yön belirler; aksi halde
        // satır yarıdan fazla açıldıysa açık kalır.
        settle(
          Math.abs(gesture.vx) > FLING_VELOCITY
            ? gesture.vx < 0
            : offset <= -OPEN_THRESHOLD,
        );
      },
      onPanResponderTerminate: () => settle(ctx.open),
    });
  }

  const handleDeletePress = () => {
    settle(false);
    onDelete();
  };

  return (
    <View className="overflow-hidden">
      {enabled ? (
        <View
          className="absolute bottom-0 right-0 top-0"
          style={{ width: ACTION_WIDTH, backgroundColor: theme.destructive }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deleteAccessibilityLabel}
            onPress={handleDeletePress}
            className="flex-1 items-center justify-center gap-1 active:opacity-80"
          >
            <Icon name="trash-2" size={18} color="#ffffff" />
            <Text weight="medium" className="text-xs" style={{ color: '#ffffff' }}>
              {deleteLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Animated.View
        style={{ backgroundColor: theme.card, transform: [{ translateX }] }}
        {...responderRef.current.panHandlers}
      >
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
    </View>
  );
}
