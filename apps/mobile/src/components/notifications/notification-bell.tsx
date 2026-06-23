import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { ScreenHeaderAction } from '@/components/screen-header';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

/**
 * Bildirim zili — ana ekranların başlık sağ üstündeki badge'li çan ikonu
 * (2026-06-23). Bildirim sekmesi alt tab bar'dan kaldırıldığında (sol 2 | + |
 * sağ 2 simetrisi için) bildirim merkezine erişim bu zile taşındı.
 *
 * `ScreenHeaderAction` tabanlı yuvarlak chip; üstünde okunmamış sayısı rozeti.
 * `unreadCount`'u kendi içinde çeker; React Query cache anahtarı `(app)/_layout`
 * ve bildirim merkezindeki sorguyla aynı (`notifications.unreadCount`) olduğundan
 * ek istek yaratmaz, paylaşımlı cache'ten okur. Soğuk başlatmada oturum
 * SecureStore'dan async hidre olana dek sorgu inert (`enabled: !!session`) —
 * proje standardı (bkz. `notification-detail`, `_layout`).
 */
export function NotificationBell() {
  const trpc = useTRPC();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const unreadQuery = useQuery({
    ...trpc.notifications.unreadCount.queryOptions(),
    enabled: !!session,
  });
  const unreadCount = unreadQuery.data?.count ?? 0;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <View>
      <ScreenHeaderAction
        icon="bell"
        accessibilityLabel={strings.tabs.notifications}
        onPress={() => router.navigate('/(app)/(notifications)')}
      />
      {unreadCount > 0 ? (
        // Okunmamış sayısı rozeti — sağ üstte, destructive zemin / beyaz metin.
        // `pointerEvents="none"` rozet dokunuşları altındaki çan butonuna geçirir.
        <View
          pointerEvents="none"
          className="absolute -right-1 -top-1 min-w-5 items-center justify-center rounded-full bg-destructive px-1 py-0.5"
        >
          <Text
            weight="semibold"
            tabletScale={1}
            className="text-[10px] leading-none text-white"
          >
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
