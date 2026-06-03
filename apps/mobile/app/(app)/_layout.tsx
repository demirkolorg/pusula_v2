import { useEffect, useRef } from 'react';
import { AppState, View, useColorScheme } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { ConnectionBanner } from '@/components/connection-banner';
import { CreateTabButton } from '@/components/create-tab-button';
import { FloatingPillTabBar } from '@/components/floating-pill-tab-bar';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { PushPermissionPrimer } from '@/components/push-permission-primer';
import { QuickNoteDraftProvider } from '@/lib/quick-note-draft';
import { useForegroundNotificationRefresh } from '@/lib/use-foreground-notification-refresh';
import { useIsTablet } from '@/lib/use-device-class';
import { useNotificationDeepLink } from '@/lib/use-notification-deep-link';
import { useTRPC } from '@/trpc/provider';
import { strings } from '@/lib/strings';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * Cold-start initial route'u — file-scope `unstable_settings` export (Expo
 * Router gereği). 2026-05-21 3. tur DEM-241 fix'i: önceki turda export-only
 * yeterli olmadı; **`<Tabs>` `AppShell` alt component'inde** render ediliyordu,
 * Expo Router metadata-binding'i nested navigator'a ulaşmıyor olabilirdi. Bu
 * turda `<Tabs>` doğrudan `AppLayout` (default export) içine inline edildi;
 * defansif olarak `<Tabs>` JSX'inde `initialRouteName` + `backBehavior` da set.
 */
export const unstable_settings = {
  initialRouteName: '(boards)',
};

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
 *
 * DEM-219: `useForegroundNotificationRefresh` foreground'da gelen push'u açık
 * board/kart ekranı ve rozet için sessiz cache invalidate'e bağlar.
 *
 * DEM-241 3. tur (2026-05-21): `<Tabs>` doğrudan bu default export'un içinde
 * render edilir (önceden `AppShell` alt component'indeydi). Bütün hook'lar
 * top-level — oturum gelmeden önce `enabled: !!session` ile inert kalırlar.
 */
export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const theme = themeFor(useColorScheme());
  const trpc = useTRPC();
  // Faz 15H (2026-05-31 2. tur) — iPad'de tab bar floating pill bottom nav'a
  // taşındı (Apple Music iPad / Trello iPad güncel pattern). Phone'da default
  // `BottomTabBar` (alt full-width). 15E ilk turunda `tabBarPosition: 'top'`
  // shipped'ti; K4 revize edilince rollback edildi + 15H custom `tabBar` prop'u
  // ile floating pill devreye girdi. Border yönü conditional kaldırıldı (default
  // `borderTopColor`); klavye gizleme `true` default'a döndü (composer pill'i
  // örtmesin). Pill render: `FloatingPillTabBar` — `BottomTabBarProps`'tan
  // okur, scroll içeriğin üstünde yüzer.
  const isTablet = useIsTablet();

  // Top-level hook'lar — kuralı gereği koşulsuz çağrılır. Oturum yokken
  // navigate çağrıları authenticated route'a yönlendirse bile auth-redirect
  // zinciri yakalar; query `enabled` ile inert kalır.
  useNotificationDeepLink();
  useForegroundNotificationRefresh();

  // Okunmamış bildirim rozeti. Hata/0 durumunda rozet gizlenir; bildirim
  // merkezi `markRead`/`markAllRead` mutation'ları bu sorguyu invalidate eder.
  const unreadQuery = useQuery({
    ...trpc.notifications.unreadCount.queryOptions(),
    enabled: !!session,
  });
  const unreadCount = unreadQuery.data?.count ?? 0;

  // iOS app-icon rozetini okunmamış sayıyla senkronize tut. Backend push'ta
  // `aps.badge` gönderir (worker notification-push) → uygulama kapalıyken ikon
  // güncellenir; bu effect uygulama içi okuma (`markRead`/`markAllRead`
  // unreadCount'u invalidate eder) + foreground refresh sonrası rozeti
  // düzeltir/sıfırlar. (Logout rozeti `(account)` signOut handler'ı
  // `setBadgeCountAsync(0)` ile ayrıca temizler — burada cache disable olunca
  // unreadCount sıfırlanmaz.)
  //
  // NOT: `setBadgeCountAsync` ancak iOS badge yetkisi (UNAuthorizationOptionBadge)
  // alınmışsa etki eder. O yetki push izin akışında AÇIKÇA istenir
  // (`use-push-token-registration` → `requestPermissionsAsync({ ios: {
  // allowBadge: true }})`). Yetki yoksa bu çağrı sessizce no-op olur — rozet
  // ekrandaki son değerinde donar (bu fix'ten önceki kök neden buydu).
  useEffect(() => {
    void Notifications.setBadgeCountAsync(unreadCount);
  }, [unreadCount]);

  // Defansif (2026-06-03): app foreground'a her dönüşte rozeti güncel
  // `unreadCount` ile yeniden yaz. Mount-timing kaynaklı kaçırmaları (örn.
  // arka plandayken markAllRead/okuma sonrası ön plana dönüş, ya da effect
  // ilk koştuğunda yetki henüz verilmemişti) telafi eder. `unreadCountRef`
  // sayesinde listener bağımlılığa girmez (her sayı değişiminde re-subscribe
  // etmeyiz), ama active'e geçişte en güncel değeri okur.
  const unreadCountRef = useRef(unreadCount);
  unreadCountRef.current = unreadCount;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Notifications.setBadgeCountAsync(unreadCountRef.current);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  if (isPending) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <View className="flex-1">
      {/* Push izni priming Sheet'i — izin `undetermined` ise görünür (7L). */}
      <PushPermissionPrimer />
      <ConnectionBanner />
      {/* Hızlı-not taslağı: anasayfa dock'u ↔ merkezi "+" butonu paylaşımı
          (DEM-230). `<Tabs>`'i sarar — hem tab bar butonu hem ekranlar erişir. */}
      <QuickNoteDraftProvider>
        <Tabs
          // Defans-1: file-scope `unstable_settings.initialRouteName` (yukarıda).
          // Defans-2: `<Tabs>` prop'u — React Navigation seviyesinde initial tab.
          // Defans-3: `backBehavior="initialRoute"` — Android back tuşu + bazı
          // sürümlerde cold-start tab seçimi üzerinde etkili.
          initialRouteName="(boards)"
          backBehavior="initialRoute"
          // Faz 15H: tablet'te custom floating pill, phone'da default BottomTabBar.
          // `FloatingPillTabBar` scroll içeriğin üstünde yüzer; default tab bar
          // değişmez (phone parite garantisi).
          tabBar={(props) =>
            isTablet ? <FloatingPillTabBar {...props} /> : <BottomTabBar {...props} />
          }
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.mutedForeground,
            tabBarStyle: {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
            },
            // Native tab etiketleri `Text` değildir — Poppins'i style ile uygula.
            tabBarLabelStyle: { fontFamily: fontFamilyForWeight.medium },
            // Klavye açıldığında tab bar'ı gizle (DEM-236) — iOS varsayılanı false;
            // anasayfa `QuickNoteDock` tab bar tepesinde oturduğundan klavye dock'u
            // örtüyordu. Hem iOS hem Android'de klavye fokus'unda tab bar kalkar →
            // dock'un kendi keyboard listener'ı dock'u doğrudan klavyenin üstüne
            // çıkar; send butonu dock-içinde olduğundan klavye accessory gibi
            // erişilebilir kalır (DEM-236 2. tur).
            //
            // Faz 15H: iPad floating pill'i de aynı kuralla gizlenir (composer
            // pill'in altında kalmamalı — klavye accessory işleyişi tabletde de
            // doğrudur).
            tabBarHideOnKeyboard: true,
          }}
        >
          {/*
            Gizli index route'u (DEM-241 4. tur kök-neden fix'i — 2026-05-21).
            `app/(app)/index.tsx` cold-start `/` yolunu otoriter olarak yakalar
            ve `(boards)`'a redirect eder. `href={null}` tab bar'da göstermez —
            yalnız yönlendirme amaçlı kayıtlı route.
          */}
          <Tabs.Screen name="index" options={{ href: null }} />
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
              // Faz 15H: tablet pill içinde kompakt mod — `flex-1` wrap + yükseltme
              // kaldırılır, buton diğer pill sekmeleriyle eşit boyutta kalır.
              tabBarButton: () => <CreateTabButton compact={isTablet} />,
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
      </QuickNoteDraftProvider>
    </View>
  );
}
