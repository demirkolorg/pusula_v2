'use client';

import { createAuthClient } from 'better-auth/react';
import { env } from '@/env';

/**
 * Browser-side Better Auth client. Points at the API server, where Better Auth's
 * routes are mounted under `/api/auth/*`. Used by the auth screens and the
 * `(app)` shell for `useSession` / `signIn` / `signUp` / `signOut`.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
