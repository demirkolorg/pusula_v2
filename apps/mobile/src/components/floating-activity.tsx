import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';
import { paletteColors, type themeFor } from '@/theme/tokens';

/**
 * Board mockup çevresinde yüzen dekoratif mini aktivite kartları — web
 * `/sign-in` `floating-activity.tsx`'in mobil karşılığı. "Ürün canlı" hissi
 * veren küçük cam bildirim parçaları.
 *
 * Tamamen süstür: ekran okuyuculara gizli, etkileşim almaz
 * (`pointerEvents="none"`). İçerik {@link strings.auth.landing.floatingActivity}.
 * Board mockup'ı saran `relative` kapsayıcı içinde `absolute` yerleşir; bu yüzden
 * `pointerEvents="box-none"` yerine kapsayıcı taşmayı yönetir (bkz. sign-in).
 *
 * Her parça y ekseninde yavaş, hafif salınır (Reanimated `withRepeat`, her biri
 * farklı süre/gecikme). `prefers-reduced-motion` açıksa statik durur.
 * `Animated.View` yalnız `style` ile sürülür (className değil — cssInterop
 * üretimde kayıtlı değil).
 */

const ease = Easing.inOut(Easing.sin);

/** Avatar dairesi tonu — `paletteColors` (web `--palet-*`). */
type AvatarTone = keyof typeof paletteColors;

type FloatingPiece = {
  icon: IconName;
  tone: AvatarTone;
  text: string;
  time: string;
  /** Mutlak konum (`absolute` ile birlikte uygulanır). */
  position: ViewStyle;
  /** Tek yönlü salınım süresi (ms) — tam döngü ≈ 2×. */
  duration: number;
  /** Başlangıç gecikmesi (ms). */
  delay: number;
};

function buildPieces(): FloatingPiece[] {
  const copy = strings.auth.landing.floatingActivity;
  // Konumlar panoyu çerçeveler: sol-üst · sağ kenar ortası · sol-alt.
  return [
    {
      icon: 'arrow-right',
      tone: 'mavi',
      text: copy.cardMoved,
      time: copy.timeMovedAgo,
      position: { top: -14, left: -10 },
      duration: 3500,
      delay: 0,
    },
    {
      icon: 'message-square',
      tone: 'mor',
      text: copy.newComment,
      time: copy.timeCommentAgo,
      position: { top: '34%', right: -8 },
      duration: 4500,
      delay: 700,
    },
    {
      icon: 'calendar',
      tone: 'turuncu',
      text: copy.dueSoon,
      time: copy.timeDueAgo,
      position: { bottom: -12, left: 28 },
      duration: 4000,
      delay: 1300,
    },
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function FloatingPieceCard({
  piece,
  theme,
}: {
  piece: FloatingPiece;
  theme: ReturnType<typeof themeFor>;
}) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      return;
    }
    translateY.value = withDelay(
      piece.delay,
      withRepeat(withTiming(-8, { duration: piece.duration, easing: ease }), -1, true),
    );
  }, [reduceMotion, translateY, piece.delay, piece.duration]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          maxWidth: 192,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: hexToRgba(theme.border, 0.6),
          backgroundColor: hexToRgba(theme.card, 0.94),
          paddingHorizontal: 10,
          paddingVertical: 8,
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.6,
          shadowRadius: 8,
          elevation: 4,
        },
        piece.position,
        animStyle,
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: paletteColors[piece.tone],
        }}
      >
        <Icon name={piece.icon} size={12} color={theme.primaryForeground} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text weight="medium" numberOfLines={1} className="text-[11px] leading-tight text-card-foreground">
          {piece.text}
        </Text>
        <Text className="text-[10px] leading-tight text-muted-foreground">{piece.time}</Text>
      </View>
    </Animated.View>
  );
}

export function FloatingActivity() {
  const theme = useTheme();
  const pieces = buildPieces();

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {pieces.map((piece) => (
        <FloatingPieceCard key={piece.text} piece={piece} theme={theme} />
      ))}
    </View>
  );
}
