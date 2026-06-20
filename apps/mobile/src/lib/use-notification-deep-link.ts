/**
 * Faz 7L — push'a dokunma + universal/şema link → deep link navigasyonu.
 *
 * `AppShell`'de (oturum garantili) koşar. İki bağımsız kaynağı dinler ve hedef
 * türetilirse `router.navigate` eder:
 *
 *  (a) Push'a dokunma — cold-start `getLastNotificationResponseAsync()` (uygulama
 *      kapalıyken bildirime dokunulup açıldıysa, bir kez işlenir) + sıcak
 *      `addNotificationResponseReceivedListener`. Bildirimin `request.content.data`'sı
 *      (`{ type, notificationId?, cardId?, boardId? }`) `notification-target.ts` ile
 *      hedefe çevrilir. Faz 5+6: `data.notificationId` varsa hedef **bildirim detay
 *      ekranıdır** (`/notifications/[id]`); yoksa (eski push) doğrudan kart hedefine
 *      düşülür (geri uyum).
 *  (b) Universal/şema URL — `expo-linking` `getInitialURL()` (cold) +
 *      `addEventListener('url', …)` (warm). URL `deep-link.ts` ile hedefe çevrilir.
 *
 * Best-effort: tüm okuma/parse hataları sessizce yutulur — deep link UI'yı
 * bloklamamalı. Listener'lar cleanup'ta `remove()` edilir.
 */
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { deepLinkTarget } from '@/lib/deep-link';
import { notificationTarget } from '@/lib/notification-target';

type Router = ReturnType<typeof useRouter>;

/** Bir bildirim cevabını (`NotificationResponse`) hedefe çevirip yönlendirir. */
function navigateFromResponse(
  router: Router,
  response: Notifications.NotificationResponse | null,
): void {
  if (!response) return;
  const data = response.notification.request.content.data;
  // Push `data.notificationId` varsa bildirim detay ekranı hedeflenir (Faz 6);
  // yoksa `notificationTarget` kart hedefine düşer (eski push payload'ları).
  const notificationId =
    data && typeof data === 'object' && typeof (data as Record<string, unknown>).notificationId === 'string'
      ? ((data as Record<string, unknown>).notificationId as string)
      : null;
  const target = notificationTarget({
    workspaceId: null,
    boardId: null,
    cardId: null,
    payload: data,
    notificationId,
  });
  if (target) router.navigate(target);
}

/** Bir gelen URL'yi hedefe çevirip yönlendirir. */
function navigateFromUrl(router: Router, url: string | null | undefined): void {
  const target = deepLinkTarget(url);
  if (target) router.navigate(target);
}

/**
 * Push dokunması + universal link navigasyonunu kurar. Dönüş değeri yok — yan
 * etki (router.navigate) için çağrılır. `AppShell`'de bir kez mount edilir.
 */
export function useNotificationDeepLink(): void {
  const router = useRouter();
  // Cold-start kaynakları (son push cevabı + ilk URL) yalnız bir kez işlenir;
  // her render'da yeniden navigasyon tetiklenmemeli.
  const coldStartHandled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // (a) + (b) cold-start kaynakları — uygulama kapalıyken gelen tetikleyici.
    const handleColdStart = async () => {
      if (coldStartHandled.current) return;
      coldStartHandled.current = true;
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled) navigateFromResponse(router, lastResponse);
      } catch {
        // Best-effort — okuma başarısızsa navigasyon yapılmaz.
      }
      try {
        const initialUrl = await Linking.getInitialURL();
        if (!cancelled) navigateFromUrl(router, initialUrl);
      } catch {
        // Best-effort.
      }
    };
    void handleColdStart();

    // (a) sıcak push dokunması — uygulama açık/arka plandayken.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => navigateFromResponse(router, response),
    );
    // (b) sıcak universal/şema URL.
    const urlSub = Linking.addEventListener('url', ({ url }) =>
      navigateFromUrl(router, url),
    );

    return () => {
      cancelled = true;
      responseSub.remove();
      urlSub.remove();
    };
  }, [router]);
}
