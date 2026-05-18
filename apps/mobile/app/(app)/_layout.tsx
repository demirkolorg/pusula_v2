import { useColorScheme } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { strings } from '@/lib/strings';
import { fontFamilyForWeight } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/**
 * Korumalı app-shell — alt tab bar (4 sekme: Panolar / Arama / Bildirimler /
 * Hesap; kullanıcı kararı 2026-05-17). Oturum çözülürken spinner; oturum yoksa
 * `(auth)/sign-in`'e yönlendirir.
 *
 * "Panolar" sekmesi `(boards)` route grubu = kendi `<Stack>`'i (workspace
 * listesi → board listesi). Arama (7I) ve Bildirimler (7K) bu fazda "yakında"
 * placeholder ekranı gösterir.
 */
export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const theme = themeFor(useColorScheme());

  if (isPending) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
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
      <Tabs.Screen
        name="notifications"
        options={{
          title: strings.tabs.notifications,
          tabBarIcon: ({ color, size }) => <Icon name="bell" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: strings.tabs.account,
          tabBarIcon: ({ color, size }) => <Icon name="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
