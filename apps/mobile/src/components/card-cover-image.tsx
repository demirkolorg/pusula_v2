import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { RouterOutputs } from '@pusula/api';
import { RemoteImage } from '@/components/remote-image';
import { useCardCoverView } from '@/lib/use-card-cover-view';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';

/** `board.get` kart sözleşmesindeki kapak görseli alanı (non-null). */
type CoverImage = NonNullable<RouterOutputs['board']['get']['cards'][number]['coverImage']>;

/** `fit` modunda kenar boşluğunu dolduran blur'lu arka plan yoğunluğu (px). */
const FIT_BACKDROP_BLUR_PX = 24;

/** Kapak şeridi yükseklik/şekil varyantları. */
const VARIANT_CLASS = {
  /** Board kart yüzü — ince şerit; kart `Pressable` zaten köşeleri yuvarlıyor. */
  card: 'h-24 w-full bg-muted',
  /** Kart detay — kendi başına duran, köşeleri yuvarlatılmış kapak kartı. */
  detail: 'h-44 w-full rounded-xl bg-muted',
} as const;

/**
 * Kart kapak görseli şeridi (Faz 7P + DEM-217 + DEM-227). `board.get` / `card.get`
 * kart sözleşmesi kapak için hem `{ attachmentId, fileName, mimeType, size }`
 * metadata'sını hem de **server-side üretilmiş** presigned GET URL'i
 * (`coverImageUrl`, TTL 1 saat) döndürür. Kapak başına ayrı
 * `attachment.getDownloadUrl` query'si (eski "waterfall") kaldırıldı — URL
 * board/kart yanıtıyla tek seferde gelir.
 *
 * Render `RemoteImage`'a delege edilir: görsel inene kadar Pusula spinner yer
 * tutar (ekranın render'ını bloklamaz), görsel inince yumuşakça belirir.
 * `coverImageUrl` `null` ise (presigned URL üretilemedi — ör. ek silinmiş veya
 * objectStorage yapılandırılmamış) şerit hiç gösterilmez.
 *
 * `variant='card'` board kart yüzünde (ince şerit, sabit `cover`),
 * `variant='detail'` kart detay ekranında kullanılır. **Detay** varyantında
 * `cardId` verilirse kapak çift dokunuşla `fit`↔`banner` moduna geçer (web kart
 * modalı paritesi): `banner` alanı doldurur (kırpar), `fit` görseli sığdırır
 * ve kenar boşluğunu aynı görselin blur'lu kopyasıyla doldurur. Tercih kart
 * bazlı saklanır; telefon/tablet ortak (yalnız yükseklik cihaza göre artar).
 */
export function CardCoverImage({
  coverImage,
  coverImageUrl,
  variant = 'card',
  cardId,
}: {
  coverImage: CoverImage;
  /**
   * Kapak görseli için presigned GET URL — `board.get` / `card.get` yanıtında
   * server-side üretilir (DEM-227). `null` ⇒ kapak şeridi gösterilmez.
   */
  coverImageUrl: string | null;
  variant?: keyof typeof VARIANT_CLASS;
  /**
   * Kart id — yalnız `variant='detail'`. Verilirse kapak çift dokunuşla
   * `fit`↔`banner` moduna geçer ve tercih kart bazlı saklanır. Verilmezse
   * (board kart yüzü) bugünkü sabit `cover` davranışı korunur.
   */
  cardId?: string;
}) {
  // Presigned URL alınamazsa kapak şeridi hiç gösterilmez (mevcut davranış).
  if (!coverImageUrl) return null;

  // İnteraktif kapak yalnız kart detayda + cardId verildiğinde. Diğer her durumda
  // (board kart yüzü) bugünkü sabit `cover` davranışı.
  if (variant === 'detail' && cardId != null) {
    return (
      <CardCoverDetail
        cardId={cardId}
        coverImageUrl={coverImageUrl}
        fileName={coverImage.fileName}
      />
    );
  }

  return (
    <RemoteImage
      uri={coverImageUrl}
      accessibilityLabel={coverImage.fileName}
      resizeMode="cover"
      className={VARIANT_CLASS[variant]}
    />
  );
}

/**
 * Kart detay kapağının interaktif varyantı (web kart modalı çift-tık paritesi).
 * Hook'lar koşulsuz çalışsın diye ayrı bileşene ayrıldı — üst bileşen URL/varyant
 * koşullarına göre erken dönebiliyor. Çift dokunuş `fit`↔`banner` çevirir;
 * gesture `runOnJS(true)` ile JS thread'inde çalışır (worklet/reanimated köprüsü
 * gerekmez). Yükseklik tablette biraz artar — `fit` modunda sığdırılmış görsele
 * daha çok yer.
 */
function CardCoverDetail({
  cardId,
  coverImageUrl,
  fileName,
}: {
  cardId: string;
  coverImageUrl: string;
  fileName: string;
}) {
  const { view, toggle } = useCardCoverView(cardId);
  const isTablet = useIsTablet();

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd((_event, success) => {
          if (success) toggle();
        }),
    [toggle],
  );

  // Tablette biraz daha yüksek kapak — `fit` modunda sığdırılan görsel nefes alır.
  const heightClass = isTablet ? 'h-60' : 'h-44';
  const hint =
    view === 'fit' ? strings.cardDetail.coverViewToBanner : strings.cardDetail.coverViewToFit;

  return (
    <GestureDetector gesture={doubleTap}>
      <View
        className={`w-full overflow-hidden rounded-xl bg-muted ${heightClass}`}
        accessibilityRole="imagebutton"
        accessibilityLabel={fileName}
        accessibilityHint={hint}
      >
        {view === 'fit' ? (
          <>
            {/* Kenar boşluğu dolgusu: aynı görselin blur'lu, alanı dolduran kopyası.
                Spinner gösterme — ön görsel zaten kendi spinner'ını taşır.
                Konum `StyleSheet.absoluteFill` ile (NativeWind `absolute inset-0`
                RemoteImage kapsayıcısında güvenilir boyut vermiyordu — katman 0'a
                düşüp görsel kayboluyordu). */}
            <RemoteImage
              uri={coverImageUrl}
              resizeMode="cover"
              blurRadius={FIT_BACKDROP_BLUR_PX}
              style={StyleSheet.absoluteFill}
              placeholder={<View />}
            />
            {/* Asıl görsel: en-boy oranı korunarak sığdırılır (web `object-contain`). */}
            <RemoteImage
              uri={coverImageUrl}
              accessibilityLabel={fileName}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          // banner: alanı doldur (web `object-cover` — kenarlar kırpılır).
          <RemoteImage
            uri={coverImageUrl}
            accessibilityLabel={fileName}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    </GestureDetector>
  );
}
