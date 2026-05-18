/**
 * Kayıtlı Expo push token'ının oturum-içi belleği (Faz 7K).
 *
 * `usePushTokenRegistration` token'ı `push.tokens.register`'a yazdıktan sonra
 * burada saklar; `account.tsx` logout akışı `push.tokens.revoke` için bu
 * değeri okur. Kalıcı depo (SecureStore) gerekmez — token cihaz başına Expo
 * tarafından üretilir ve uygulama her açılışında `getExpoPushTokenAsync` ile
 * yeniden elde edilebilir; bu modül yalnız aynı oturumdaki revoke'u register'a
 * gitmeden hızlandırır.
 *
 * Modül-düzeyi singleton — saf değil (yan durum tutar) ama RN/Expo importu
 * yok; basit get/set sözleşmesi test edilebilir.
 */
let registeredPushToken: string | null = null;

/** Register sonrası token'ı belleğe yazar. */
export function setRegisteredPushToken(token: string): void {
  registeredPushToken = token;
}

/** Bu oturumda kaydedilmiş token (yoksa `null`). */
export function getRegisteredPushToken(): string | null {
  return registeredPushToken;
}

/** Belleği temizler (logout sonrası — token artık bu hesaba ait değil). */
export function clearRegisteredPushToken(): void {
  registeredPushToken = null;
}
