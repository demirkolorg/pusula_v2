'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side Better Auth client. Points at the API server, where Better Auth's
 * routes are mounted under `/api/auth/*`. Sign-in/up/out screens land in Phase 1.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
