import { useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/** Gizlilik politikası — web'deki public sayfa (App Store gizlilik URL'i). */
const PRIVACY_POLICY_URL = 'https://pusulaportal.com/gizlilik';

/**
 * Gizlilik politikası ekranı (2026-06-20) — politikayı harici tarayıcı /
 * Custom Tab yerine **uygulama içi WebView**'de açar (kullanıcı kararı). Native
 * header (geri + başlık) `(account)/_layout.tsx`'ten gelir; WebView header'ın
 * altını doldurur. Yüklenene dek merkezi spinner overlay'i gösterilir.
 *
 * `react-native-webview` zaten native bağımlılık (autolinked) — salt-JS ekleme,
 * `eas build` gerektirmez. Stil `className` yerine `style` ile verilir (WebView
 * native bileşeni NativeWind interop'una dahil değil).
 */
export default function PrivacyPolicyScreen() {
  const theme = themeFor(useColorScheme());
  const [loading, setLoading] = useState(true);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: strings.account.privacyPolicyRow }} />
      <WebView
        source={{ uri: PRIVACY_POLICY_URL }}
        onLoadEnd={() => setLoading(false)}
        style={{ flex: 1, backgroundColor: theme.background }}
      />
      {loading ? (
        <View
          className="absolute inset-0 items-center justify-center bg-background"
          pointerEvents="none"
        >
          <ActivityIndicator color={theme.mutedForeground} />
        </View>
      ) : null}
    </View>
  );
}
