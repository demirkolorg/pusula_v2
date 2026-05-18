/**
 * Push cihaz yardımcıları (Faz 7K) — Expo push token kaydı için saf,
 * RN/Expo importsuz parçalar (cihaz adı türetme, platform daraltma).
 *
 * Asıl izin/token akışı `use-push-token-registration.ts`'te (Expo
 * `expo-notifications` köprüsü). Buradaki saf fonksiyonlar birim test edilir.
 */
import type { PushTokenPlatform } from '@pusula/domain';

/**
 * `Platform.OS` değerini `push.tokens.register` `platform` alanına daraltır.
 * Domain `PUSH_TOKEN_PLATFORMS` `ios | android | web`; mobil cihazda yalnız
 * ilk ikisi beklenir, beklenmeyen değer (`windows`/`macos`) `web`'e düşer.
 */
export function pushPlatform(os: string): PushTokenPlatform {
  return os === 'ios' || os === 'android' ? os : 'web';
}

/**
 * `push.tokens.register` `deviceName` alanı için insan-okur cihaz etiketi.
 * Expo `Device.deviceName` boş olabilir; o durumda marka/model ya da sade
 * platform adına düşülür. Domain şeması 120 karakterle sınırlar — burada da
 * kırparız ki uzun bir isim 400 üretmesin.
 */
export function deviceLabel(
  parts: { deviceName?: string | null; modelName?: string | null; os: string },
): string {
  const candidate =
    (parts.deviceName && parts.deviceName.trim()) ||
    (parts.modelName && parts.modelName.trim()) ||
    (parts.os === 'ios' ? 'iOS cihazı' : parts.os === 'android' ? 'Android cihazı' : 'Cihaz');
  return candidate.slice(0, 120);
}
