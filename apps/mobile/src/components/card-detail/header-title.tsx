import { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';

type CardDetailHeaderTitleProps = {
  /** Gövde başlığı nav bar'a kayınca `true` — kart başlığına geçilir. */
  collapsed: boolean;
  /** Kartın bulunduğu liste adı — başlık görünürken nav bar bunu gösterir. */
  listTitle: string | null;
  cardTitle: string;
};

/**
 * Kart detay ekranının collapsing nav başlığı (Faz 7G-3). Gövdedeki büyük kart
 * başlığı ekranda görünürken nav bar kartın listesini gösterir; başlık yukarı
 * kayınca kısa bir çapraz-geçişle kart başlığına döner. Böylece üst nav ile
 * gövde başlığı arasındaki metin tekrarı ortadan kalkar, nav bar her durumda
 * bağlam taşır (liste adı veya kart başlığı).
 *
 * Geçiş scroll'a bağlı değil tek seferlik bir `collapsed` eşiğine bağlıdır —
 * scroll sırasında ekran yeniden render olmaz, yalnızca eşik geçilince 1 kez.
 */
export function CardDetailHeaderTitle({
  collapsed,
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

  // 0 = liste adı görünür, 1 = kart başlığı görünür.
  const progress = useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: collapsed ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [collapsed, progress]);

  const listOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={{ maxWidth }}>
      {/* Görünmez ölçüm — yalnızca konteyner boyutunu belirler. */}
      <Text
        weight="semibold"
        numberOfLines={1}
        className="text-base"
        style={{ opacity: 0 }}
      >
        {sizerText}
      </Text>

      <Animated.View
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: listOpacity }}
      >
        <Text weight="medium" numberOfLines={1} className="text-base text-muted-foreground">
          {listLabel}
        </Text>
      </Animated.View>

      <Animated.View
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: progress }}
      >
        <Text weight="semibold" numberOfLines={1} className="text-base text-foreground">
          {cardTitle}
        </Text>
      </Animated.View>
    </View>
  );
}
