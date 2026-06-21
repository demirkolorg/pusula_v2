import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, Image, type ImageResizeMode, type StyleProp, type ViewStyle } from 'react-native';
import { AppSpinner } from '@/components/app-spinner';
// NOT (yerel build geçici): expo-image precompiled AAR yerel Android dev build'de
// Fabric ViewManager kaydetmiyor → "ViewManagerAdapter_ExpoImage undefined" crash.
// RN Image'a düşürüldü. COMMIT EDİLMEZ — EAS build expo-image ile çalışıyor.

type RemoteImageProps = {
  /** Görsel kaynağı. `null`/`undefined` → URL henüz hazır değil (placeholder gösterilir). */
  uri: string | null | undefined;
  accessibilityLabel?: string;
  /**
   * Görselin alana yerleşimi — geriye dönük uyum için RN `Image` `resizeMode`
   * adlandırması korunur (`cover` / `contain` / `stretch` / `center`).
   * İçeride `expo-image` `contentFit` değerine eşlenir. Varsayılan `cover`.
   */
  resizeMode?: ImageResizeMode;
  /**
   * Blur yoğunluğu (px) — kapak `fit` modunda görselin kenar boşluğunu dolduran
   * blur'lu arka plan kopyası için. RN `Image` ve `expo-image` ikisi de
   * `blurRadius` destekler. Verilmezse blur uygulanmaz.
   */
  blurRadius?: number;
  /** Kapsayıcı className — boyut / şekil / arka plan buradan verilir. */
  className?: string;
  /** Kapsayıcı ek stili — sabit boyut (avatar) için `{ width, height }`. */
  style?: StyleProp<ViewStyle>;
  /**
   * URL beklenirken / görsel yüklenirken (ve hata halinde) gösterilen içerik.
   * Verilmezse merkezî `AppSpinner` (hata halinde boş). Avatar gibi yerlerde
   * baş-harf bloğu geçilir — hata halinde de görünür kalır.
   */
  placeholder?: ReactNode;
  /** Varsayılan spinner boyutu (placeholder verilmediğinde). */
  spinnerSize?: 'xs' | 'sm' | 'md' | 'lg';
  /** Varsayılan spinner rengi (koyu zeminlerde — örn. lightbox). */
  spinnerColor?: string;
};

/**
 * Uzaktan görsel yükleyici — `expo-image` tabanlı (DEM-228). Görsel inene kadar
 * spinner/placeholder gösterir, görsel inince native geçişle (`transition`)
 * yumuşakça belirir. İçinde bulunduğu ekranın render'ını bloklamaz: kapsayıcı
 * hemen çizilir, görsel arka planda iner. `onError`'da spinner kalkar (sonsuz
 * dönmez); verilen placeholder (örn. avatar baş-harfi) hata halinde de görünür
 * kalır.
 *
 * `expo-image` görseli diske + belleğe cache'ler (`cachePolicy="memory-disk"`)
 * — kapak görseli / avatar her görüntülemede ağdan yeniden inmez; ayrıca
 * `allowDownscaling` ile görsel kapsayıcı boyutuna göre küçültülerek çözülür
 * (bellek tasarrufu). DEM-217'deki RN `Animated.Image` + elle `useState` fade
 * implementasyonunun yerini alır; public API ve davranış aynıdır.
 *
 * Board kart kapağı (`CardCoverImage`), kart detay kapağı, `EntityAvatar` ve
 * ek lightbox'ı (`AttachmentImageViewer`) bu bileşeni kullanır.
 */
export function RemoteImage({
  uri,
  accessibilityLabel,
  resizeMode = 'cover',
  blurRadius,
  className,
  style,
  placeholder,
  spinnerSize = 'md',
  spinnerColor,
}: RemoteImageProps) {
  // Görsel başarıyla indi mi (placeholder/spinner kalkar).
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // `uri` değişince (URL geç geldi / bileşen başka görsel için yeniden
  // kullanıldı) yükleme durumunu sıfırla — aksi halde yeni URL yüklenirken
  // önceki görselin `loaded=true` durumu placeholder'ı yanlışlıkla gizlerdi.
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [uri]);

  return (
    <View className={className} style={[styles.clip, style]}>
      {uri && !error ? (
        <Image
          source={{ uri }}
          accessibilityLabel={accessibilityLabel}
          accessible={accessibilityLabel != null}
          resizeMode={resizeMode}
          blurRadius={blurRadius}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {!loaded ? (
        <View style={StyleSheet.absoluteFill}>
          {placeholder ?? (
            <View className="flex-1 items-center justify-center">
              {error ? null : <AppSpinner size={spinnerSize} color={spinnerColor} />}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
