import { useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import { themeFor } from '@/theme/tokens';

/** Gizlilik politikası — web'deki public sayfa (App Store gizlilik URL'i). */
const PRIVACY_POLICY_URL = 'https://pusulaportal.com/gizlilik';

/**
 * Gizlilik politikası görünümü (2026-06-20) — politikayı harici tarayıcı /
 * Custom Tab yerine **uygulama içi WebView**'de açar (kullanıcı kararı). Telefonda
 * native header (geri + başlık) `(account)/_layout.tsx`'ten gelir; tablet hesap
 * detail pane'inde header yoktur, WebView pane'i doldurur. Yüklenene dek merkezi
 * spinner overlay'i gösterilir.
 *
 * `react-native-webview` zaten native bağımlılık (autolinked) — salt-JS ekleme,
 * `eas build` gerektirmez. Stil `className` yerine `style` ile verilir (WebView
 * native bileşeni NativeWind interop'una dahil değil).
 */
export function PrivacyPolicyView() {
  const theme = themeFor(useColorScheme());
  const [loading, setLoading] = useState(true);

  return (
    <View className="flex-1 bg-background">
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
