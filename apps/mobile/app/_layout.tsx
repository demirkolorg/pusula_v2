import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/trpc/provider';
import { initSentry, wrapWithSentry } from '@/sentry';

// Sentry init herhangi bir ekran yüklenmeden önce çalışmalı.
initSentry();

function RootLayout() {
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
