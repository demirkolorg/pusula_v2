import '../global.css';

import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/trpc/provider';
import { fontMap } from '@/theme/fonts';
import { initSentry, wrapWithSentry } from '@/sentry';

// Sentry init herhangi bir ekran yüklenmeden önce çalışmalı.
initSentry();

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
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AppProviders>
    </SafeAreaProvider>
  );
}

// Kök bileşen Sentry hata sınırıyla sarılır (crash reporting).
export default wrapWithSentry(RootLayout);
