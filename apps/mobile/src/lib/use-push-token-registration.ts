/**
 * Faz 7K → 7L — Expo push token kaydı + izin priming.
 *
 * 7K'da push izni login sonrası **doğrudan** sade OS dialog'uyla isteniyordu.
 * 7L bu hook'u refactor etti: izin **kontrolü** ile izin **isteme** ayrıldı.
 *
 * Akış (oturum hazır olunca, `(app)/_layout.tsx` `AppShell`'te bir kez):
 *  1. `getPermissionsAsync()`.
 *  2. İzin zaten `granted` → priming atla, doğrudan token al + register.
 *  3. İzin `undetermined` + `canAskAgain` → OS dialog'unu **açma**; bunun yerine
 *     `showPrimer` döndür — `PushPermissionPrimer` Sheet'i açılır. Kullanıcı
 *     "İzin ver" derse `onPrimerAllow` → `requestPermissionsAsync` → izin
 *     verilirse token kaydı. "Şimdi değil" derse `onPrimerDismiss` → OS dialog'u
 *     hiç açılmaz (oturum başına bir kez).
 *  4. `denied` (tekrar sorulamaz) → sessizce geç.
 *
 * `expo-notifications` Expo Go'da (SDK 53+) push token vermez; `getExpoPushTokenAsync`
 * ağ ister — her hata sessizce yutulur (bildirim kaydı best-effort; UI'yı bloklamaz).
 * Kaydedilen token `account.tsx` logout akışında `push.tokens.revoke` için saklanır.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { deviceLabel, pushPlatform } from '@/lib/push-device';
import { setRegisteredPushToken } from '@/lib/push-token-store';

/** EAS `projectId` — `getExpoPushTokenAsync` bunu ister. `app.config.ts` `extra.eas.projectId`. */
function easProjectId(): string | undefined {
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas.length > 0) return fromEas;
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  return typeof fromExtra === 'string' && fromExtra.length > 0 ? fromExtra : undefined;
}

/**
 * `usePushTokenRegistration` çıktısı — `PushPermissionPrimer` bileşeniyle
 * sözleşme. `showPrimer` true ise priming Sheet'i gösterilir; kullanıcı
 * eyleminden biri seçilir.
 */
export type PushTokenRegistration = {
  /** İzin `undetermined` ve sorulabilir — priming Sheet'i gösterilmeli. */
  showPrimer: boolean;
  /** "İzin ver" — OS dialog'unu tetikler, izin verilirse token kaydı koşar. */
  onPrimerAllow: () => void;
  /** "Şimdi değil" — primer kapanır, OS dialog'u açılmaz. */
  onPrimerDismiss: () => void;
};

/** `push.tokens.register` mutation girdisi (token + platform + cihaz adı). */
type RegisterInput = {
  token: string;
  platform: ReturnType<typeof pushPlatform>;
  deviceName: string;
};

/** `push.tokens.register` mutation'ından kullanılan tek üye. */
type RegisterMutation = { mutateAsync: (input: RegisterInput) => Promise<unknown> };

/**
 * İzin verildiyse Expo push token alır ve `push.tokens.register`'a yazar.
 * Best-effort — hata yutulur. `register` mutation referansı dışarıdan verilir.
 */
async function registerPushToken(register: RegisterMutation): Promise<void> {
  try {
    const projectId = easProjectId();
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResult.data;
    if (!token) return;

    await register.mutateAsync({
      token,
      platform: pushPlatform(Platform.OS),
      deviceName: deviceLabel({ deviceName: Constants.deviceName, os: Platform.OS }),
    });
    // Logout akışı (`account.tsx`) bu token'ı `revoke` için kullanır.
    setRegisteredPushToken(token);
  } catch (error) {
    // Best-effort: Expo Go'da token yok, cihaz çevrimdışı olabilir vb. — UI'yı
    // bloklama. 2026-06-01 follow-up (BE-2026-05-31-001): silent catch Sentry'e
    // bağlandı — "push gelmiyor" şikayetleri Sentry breadcrumb'larıyla teşhis
    // edilebilir. Beklenen hatalar (Expo Go token yok, network) Sentry'e yine
    // gönderilir ama düşük gürültü tag'iyle filtrelenir.
    Sentry.captureException(error, {
      tags: { area: 'push', stage: 'register-token' },
    });
  }
}

/**
 * Oturum başına bir kez push izin durumunu kontrol eder; izin varsa token'ı
 * kaydeder, `undetermined` ise priming Sheet'i sürecek state döndürür.
 */
export function usePushTokenRegistration(): PushTokenRegistration {
  const trpc = useTRPC();
  const register = useMutation(trpc.push.tokens.register.mutationOptions());
  // Hook birden çok render'da koşar; izin kontrolü yalnız bir kez denenmeli.
  const checked = useRef(false);
  const [showPrimer, setShowPrimer] = useState(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (cancelled) return;

        // 2. İzin zaten verilmiş → priming atla, doğrudan token kaydı.
        if (current.granted) {
          await registerPushToken(register);
          return;
        }
        // 3. İzin belirsiz + sorulabilir → priming Sheet'i göster (OS dialog'u
        //    burada AÇILMAZ — kullanıcı "İzin ver" derse `onPrimerAllow` açar).
        if (current.status === 'undetermined' && current.canAskAgain) {
          setShowPrimer(true);
          return;
        }
        // 4. `denied` ya da tekrar sorulamaz → sessizce geç.
      } catch (error) {
        // Best-effort — izin okunamazsa bildirim kaydı denenmez. 2026-06-01
        // follow-up: Sentry'e bağlandı (önceden silent catch, "push gelmiyor"
        // teşhisinde kör nokta yaratıyordu).
        Sentry.captureException(error, {
          tags: { area: 'push', stage: 'check-permission' },
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // `register` bağımlılıkta — referansı değişse de `checked` ref'i izin
    // kontrolünü oturum başına bir kereye kilitler, tekrar koşmaz.
  }, [register]);

  // "İzin ver" — OS dialog'unu şimdi tetikle; izin verilirse token kaydı koşar.
  const onPrimerAllow = useCallback(() => {
    setShowPrimer(false);
    void (async () => {
      try {
        const requested = await Notifications.requestPermissionsAsync();
        if (requested.granted) await registerPushToken(register);
      } catch (error) {
        // Best-effort — OS dialog'u/token hatası UI'yı bloklamaz. 2026-06-01
        // follow-up: Sentry'e bağlandı (kullanıcı "İzin ver" derken hata
        // alırsa görmek isteriz).
        Sentry.captureException(error, {
          tags: { area: 'push', stage: 'request-permission' },
        });
      }
    })();
  }, [register]);

  // "Şimdi değil" — primer kapanır, OS dialog'u hiç açılmaz.
  const onPrimerDismiss = useCallback(() => {
    setShowPrimer(false);
  }, []);

  return { showPrimer, onPrimerAllow, onPrimerDismiss };
}
