import { View, useColorScheme } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { ConnectionBanner } from '@/components/connection-banner';
import { CreateTabButton } from '@/components/create-tab-button';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { PushPermissionPrimer } from '@/components/push-permission-primer';
import { useNotificationDeepLink } from '@/lib/use-notification-deep-link';
import { useTRPC } from '@/trpc/provider';
import { strings } from '@/lib/strings';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * Korumalı app-shell — alt tab bar (4 sekme: Panolar / Arama / Bildirimler /
 * Hesap; kullanıcı kararı 2026-05-17). Oturum çözülürken spinner; oturum yoksa
 * `(auth)/sign-in`'e yönlendirir.
 *
 * "Panolar" sekmesi `(boards)` route grubu = kendi `<Stack>`'i (workspace
 * listesi → board listesi). Arama (7I) gerçek ekran; Bildirimler (7K) bildirim
 * merkezini gösterir, sekmede okunmamış sayısı rozeti taşır.
 *
 * Faz 7M: app-shell üstüne `ConnectionBanner` — cihaz çevrimdışıyken `<Tabs>`'in
 * üstünde "bağlantı yok" şeridi belirir; çevrimiçiyken hiç yer kaplamaz.
 *
 * Faz 7K: oturum hazır olunca push izni alınır ve Expo push token'ı
 * `push.tokens.register`'a yazılır.
 *
 * Faz 7L: izin isteme cilalı bir priming `Sheet`'iyle (`PushPermissionPrimer`)
 * yapılır; ayrıca `useNotificationDeepLink` push'a dokunma + universal/şema
 * link'leri içerik ekranına yönlendirir.
 */
export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const theme = themeFor(useColorScheme());

  if (isPending) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return <AppShell theme={theme} />;
}

/**
 * Korumalı app-shell gövdesi. Oturum garantili olduktan sonra render edilir;
 * bu sayede `useQuery` (rozet) ve deep-link/push hook'ları yalnız giriş yapmış
 * kullanıcı için koşar (koşullu hook çağrısı yok).
 */
function AppShell({ theme }: { theme: ReturnType<typeof themeFor> }) {
  const trpc = useTRPC();

  // Push'a dokunma + universal/şema link → içerik ekranına yönlendirme (7L).
  useNotificationDeepLink();

  // Okunmamış bildirim rozeti. Hata/0 durumunda rozet gizlenir; bildirim
  // merkezi `markRead`/`markAllRead` mutation'ları bu sorguyu invalidate eder.
  const unreadQuery = useQuery(trpc.notifications.unreadCount.queryOptions());
  const unreadCount = unreadQuery.data?.count ?? 0;

  return (
    <View className="flex-1">
      {/* Push izni priming Sheet'i — izin `undetermined` ise görünür (7L). */}
      <PushPermissionPrimer />
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.mutedForeground,
          tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
          // Native tab etiketleri `Text` değildir — Poppins'i style ile uygula.
          tabBarLabelStyle: { fontFamily: fontFamilyForWeight.medium },
        }}
      >
        <Tabs.Screen
          name="(boards)"
          options={{
            title: strings.tabs.boards,
            tabBarIcon: ({ color, size }) => <Icon name="trello" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: strings.tabs.search,
            tabBarIcon: ({ color, size }) => <Icon name="search" color={color} size={size} />,
          }}
        />
        {/*
          Merkezi "Ekle" — gezinme sekmesi değil, yükseltilmiş aksiyon butonu
          (DEM-203). `tabBarButton` `CreateTabButton`'a verilir; o `onPress`'i
          intercept edip Hızlı Notlar'a yönlendirir, `onLongPress`'te oluşturma
          menüsünü açar. `create` ekranı asla render edilmez.
        */}
        <Tabs.Screen
          name="create"
          options={{
            title: strings.create.buttonLabel,
            tabBarButton: () => <CreateTabButton />,
          }}
        />
        <Tabs.Screen
          name="(notifications)"
          options={{
            title: strings.tabs.notifications,
            tabBarIcon: ({ color, size }) => <Icon name="bell" color={color} size={size} />,
            // Okunmamış sayısı rozeti — 0/undefined ise rozet hiç çizilmez.
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          }}
        />
        <Tabs.Screen
          name="(account)"
          options={{
            title: strings.tabs.account,
            tabBarIcon: ({ color, size }) => <Icon name="user" color={color} size={size} />,
          }}
        />
      </Tabs>
    </View>
  );
}
