import '../global.css';

import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/trpc/provider';
import { configureOnlineManager } from '@/lib/online-manager';
import { ThemeProvider } from '@/theme/theme-provider';
import { fontMap } from '@/theme/fonts';
import { initSentry, wrapWithSentry } from '@/sentry';

// Sentry init herhangi bir ekran yüklenmeden önce çalışmalı.
initSentry();

// TanStack Query `onlineManager`'ı cihaz ağ durumuna bağla (Faz 7M) — RN'de
// `navigator.onLine` yok; bu olmadan çevrimdışı sorgular boşuna retry'lar.
configureOnlineManager();

// Faz 7L: foreground bildirim sunumu. Uygulama açıkken gelen push da banner +
// bildirim listesinde gösterilir (SDK 54 alan adları — `shouldShowAlert`
// deprecated). Uygulama arka plandayken bildirimi OS gösterir.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    // app-icon rozeti: foreground'da gelen push da `aps.badge` değerini ikona
    // yazsın (arka planda OS zaten uygular). Rozet sayısını backend gönderir;
    // AppShell `(app)/_layout` okuma sonrası `setBadgeCountAsync` ile günceller.
    shouldSetBadge: true,
  }),
});

// Fontlar yüklenene kadar splash ekranı açık tutulur — sistem fontuyla
// kısa bir "flash" yaşanmaması için (proje geneli Poppins kararı).
void SplashScreen.preventAutoHideAsync();

function RootLayout() {
  // Poppins'in dört ağırlığı (400/500/600/700) yüklenir. Aynı font ailesi
  // web ile hizalıdır; ağırlık → aile eşlemesi `src/theme/fonts.ts`'te.
  const [fontsLoaded, fontError] = useFonts(fontMap);

  useEffect(() => {
    // Fontlar hazır (veya yükleme hata verdi) — splash gizlenir; hata
    // durumunda da uygulama sistem fontuyla açılır, kilitlenmez.
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // Splash görünür kalır — boş render yeterli.
    return null;
  }

  return (
    // `GestureHandlerRootView` (DEM-228) — `react-native-gesture-handler`
    // jest sisteminin köküdür; `SwipeRow` gibi `Gesture.Pan()` kullanan
    // bileşenler bu sarmalayıcı olmadan jest almaz. Kökte tek kez uygulanır,
    // `flex: 1` ile tüm uygulamayı kaplar.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* ThemeProvider (DEM-207) — açılışta saklanan tema tercihini uygular;
            StatusBar `style="auto"` ile etkin şemayı izler. */}
        <ThemeProvider>
          <AppProviders>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </AppProviders>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Kök bileşen Sentry hata sınırıyla sarılır (crash reporting).
export default wrapWithSentry(RootLayout);
