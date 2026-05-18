import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useNetworkStatus } from '@/lib/use-network-status';

/**
 * Çevrimdışı göstergesi (Faz 7M) — cihaz ağ bağlantısını kaybedince app-shell
 * üstünde beliren ince şerit.
 *
 * 7.0 kararı: mobilde realtime yok (pull-to-refresh + push). Çevrimdışıyken
 * cache persistence ("okuma offline") son görülen board/kart'ı gösterir; bu
 * banner verinin neden tazelenmediğini kullanıcıya açıklar. Çevrimiçiyken
 * hiçbir şey render etmez (şerit kaybolur). Durum saf türetmesi
 * `network-status.ts`'te — birim test edilir.
 */
export function ConnectionBanner() {
  const { isOffline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (!isOffline) return null;

  return (
    <View
      // `accessible`: çocukları tek erişilebilir düğüme indirger — ekran
      // okuyucu "Bağlantı yok"u bir kez (iç `Text` ile çift değil) duyurur.
      accessible
      accessibilityRole="alert"
      accessibilityLabel={strings.common.connectionLost}
      // `paddingTop` = güvenli alan üst boşluğu: şerit status bar alanını da
      // boyar, çevrimdışıyken üst kenar boydan boya kırmızı görünür.
      style={{ paddingTop: insets.top }}
      className="bg-destructive"
    >
      <View className="flex-row items-center justify-center gap-2 px-4 py-1.5">
        <Icon name="wifi-off" size={13} color="#ffffff" />
        <Text weight="medium" className="text-xs text-white">
          {strings.common.connectionLost}
        </Text>
      </View>
    </View>
  );
}
