import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { env } from '@/env';

/**
 * Mobil API kök URL'i — emulator ve fiziksel cihaz için tek kaynak.
 *
 * Sorun: `EXPO_PUBLIC_API_URL`'e sabit bir host yazmak iki ortamı birden
 * karşılamaz — Android emulator host makineye `10.0.2.2` takma adıyla,
 * fiziksel cihaz ise makinenin LAN IP'siyle ulaşır; LAN IP ağ değişince
 * de kayar.
 *
 * Çözüm: **dev'de** host'u Expo Metro'nun `hostUri`'sinden türetiriz —
 * cihaz Metro bundler'a hangi adresten bağlandıysa (Metro LAN modunda tüm
 * istemciler için LAN IP) API isteği de aynı host'a gider. Şema + port
 * `EXPO_PUBLIC_API_URL`'den korunur. **Üretim** build'inde `hostUri` yoktur
 * (`__DEV__` false) → doğrudan `EXPO_PUBLIC_API_URL` (gerçek https URL).
 *
 * `src/trpc/provider.tsx` ve `src/lib/auth-client.ts` bu değeri kullanır;
 * `env.EXPO_PUBLIC_API_URL` artık doğrudan tüketilmez.
 */
function resolveApiBaseUrl(): string {
  const configured = env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');

  // hostUri = "<host>:<metroPort>" (örn. "10.65.8.13:8081"). Üretim
  // build'inde tanımsızdır — o durumda yapılandırılmış URL'e düşülür.
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!__DEV__ || !metroHost) {
    return configured;
  }

  // Metro `localhost` modunda + Android emulator: emulator'ün `localhost`'u
  // kendisidir; host makineye `10.0.2.2` takma adıyla ulaşılır. (Metro LAN
  // modunda metroHost zaten LAN IP'dir; iOS simulator `localhost`'u paylaşır.)
  const host =
    metroHost === 'localhost' && Platform.OS === 'android' ? '10.0.2.2' : metroHost;

  // configured = "<scheme>://<host>[:<port>]" — yalnız host'u Metro host'uyla
  // değiştir; şema + port korunur.
  return configured.replace(
    /^(https?:\/\/)[^/:]+(:\d+)?/,
    (_match, scheme: string, port = '') => `${scheme}${host}${port}`,
  );
}

/** Mobil istemcinin konuşacağı API kök URL'i (trailing slash'sız). */
export const apiBaseUrl = resolveApiBaseUrl();
