import { useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';

type CardDetailHeaderTitleProps = {
  /**
   * Collapse ilerlemesi (Reanimated shared value): 0 = liste adı görünür,
   * 1 = kart başlığı görünür. Scroll worklet'i UI-thread'inde set eder; React
   * state'i / `Stack.Screen` options'ını YENİDEN OLUŞTURMAZ (native-stack header
   * re-process'i + "navigation context" hatasını tetiklemez — bkz. [cardId].tsx).
   */
  progress: SharedValue<number>;
  /** Kartın bulunduğu liste adı — başlık görünürken nav bar bunu gösterir. */
  listTitle: string | null;
  cardTitle: string;
};

/**
 * Kart detay ekranının collapsing nav başlığı (Faz 7G-3; 2026-06-20 shared-value
 * refactor). Gövdedeki büyük kart başlığı görünürken nav bar kartın listesini
 * gösterir; başlık yukarı kayınca kısa bir çapraz-geçişle kart başlığına döner.
 * Böylece üst nav ile gövde başlığı arasındaki metin tekrarı kalkar.
 *
 * Geçiş tamamen Reanimated shared value (`progress`) ile UI-thread'inde yapılır;
 * eşik geçişi React render'ı tetiklemez. Önceki `collapsed` React state'i,
 * `Stack.Screen` `headerTitle` closure'unu her toggle'da yeniden oluşturup
 * native-stack header/getState pipeline'ını çalıştırıyor ve "Couldn't find a
 * navigation context" hatasına yol açıyordu (tablet sekme değişimi reprosu).
 */
export function CardDetailHeaderTitle({
  progress,
  listTitle,
  cardTitle,
}: CardDetailHeaderTitleProps) {
  const { width } = useWindowDimensions();
  // Geri tuşu + kenar boşlukları için kabaca pay; uzun başlığı kırpar.
  const maxWidth = Math.max(width - 132, 120);

  const listLabel = listTitle ?? strings.cardDetail.fallbackTitle;
  // Görünmez ölçüm metni: konteyner genişliğini iki başlıktan uzun olana göre
  // belirler — hangisi görünürse görünsün metin gereksiz yere kırpılmaz.
  const sizerText = cardTitle.length >= listLabel.length ? cardTitle : listLabel;

  // 0 = liste adı görünür, 1 = kart başlığı görünür (UI-thread'inde sürülür).
  const listStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
  }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={{ maxWidth }}>
      {/* Görünmez ölçüm — yalnızca konteyner boyutunu belirler. */}
      <Text weight="semibold" numberOfLines={1} className="text-base" style={{ opacity: 0 }}>
        {sizerText}
      </Text>

      <Animated.View
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, listStyle]}
      >
        <Text weight="medium" numberOfLines={1} className="text-base text-muted-foreground">
          {listLabel}
        </Text>
      </Animated.View>

      <Animated.View
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, cardStyle]}
      >
        <Text weight="semibold" numberOfLines={1} className="text-base text-foreground">
          {cardTitle}
        </Text>
      </Animated.View>
    </View>
  );
}
