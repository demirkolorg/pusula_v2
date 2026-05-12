'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { safeRedirectPath } from '@/lib/safe-redirect';

/**
 * Renders nothing. On mount, replaces the current route with the safe
 * `?redirect=` target (or `/`). Used by the `(auth)` layout once a session is
 * present so there's a single redirect path — no race between the layout and the
 * sign-in/up pages. Kept in its own component so the layout doesn't need a
 * `useSearchParams` Suspense boundary unless a session actually exists.
 */
export function RedirectIfAuthenticated() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    router.replace(safeRedirectPath(searchParams.get('redirect')));
  }, [router, searchParams]);

  return null;
}
