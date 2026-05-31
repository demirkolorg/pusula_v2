'use client';

import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient } from 'better-auth/client/plugins';
import { env } from '@/env';

/**
 * Browser-side Better Auth client. Points at the API server, where Better Auth's
 * routes are mounted under `/api/auth/*`. Used by the auth screens and the
 * `(app)` shell for `useSession` / `signIn` / `signUp` / `signOut`.
 *
 * Faz 16A (DEM-310) — `genericOAuthClient` plugin Google Takvim hesabı bağlama
 * akışını client'a açar: `authClient.oauth2.link({ providerId, callbackURL })`
 * Better Auth'un `/api/auth/oauth2/link` endpoint'ine gider, oturum kontrolüyle
 * authorization URL döner, frontend redirect ile Google'a yönlendirir. Mevcut
 * `unlinkAccount` ve `listAccounts` endpoint'leri Better Auth core'da hep
 * vardı; bu plugin onları değil yalnız `oauth2.link` ekler.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [genericOAuthClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
