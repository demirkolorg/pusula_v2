import * as SecureStore from 'expo-secure-store';
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import { apiBaseUrl } from '@/lib/api-url';

/**
 * Mobil Better Auth client. Web `apps/web/src/lib/auth-client.ts` ile aynı API
 * yüzeyi (`signIn` / `signUp` / `signOut` / `useSession`); fark mobilde tarayıcı
 * cookie jar'ı olmaması:
 *
 * - `@better-auth/expo` `expoClient` plugin'i oturum cookie'sini `expo-secure-store`
 *   ile (şifreli cihaz deposu) saklar — `AsyncStorage` değil.
 * - `authClient.getCookie()` saklanan cookie başlığını döndürür; mobil tRPC
 *   istemcisi bunu `Cookie` başlığı olarak ekler (`src/trpc/provider.tsx`).
 * - Server tarafı `apps/api/src/auth.ts` `expo()` plugin'i bu akışı tamamlar;
 *   `pusula://` scheme'i `trustedOrigins`'tedir.
 *
 * Bkz. `docs/architecture/07-auth.md` (Mobil oturum — Faz 7B).
 */
export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  plugins: [
    expoClient({
      scheme: 'pusula',
      storagePrefix: 'pusula',
      storage: SecureStore,
    }),
  ],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
