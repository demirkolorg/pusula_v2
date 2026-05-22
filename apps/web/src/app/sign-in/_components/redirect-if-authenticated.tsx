'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { safeRedirectPath } from '@/lib/safe-redirect';

/**
 * Renders nothing. On mount, replaces the current route with the post-auth
 * landing target. Used by the `/sign-in` page guard once a session is present so
 * there's a single redirect path — no race between the page guard and the
 * multi-mode auth card.
 *
 * Resolution order (DEM-126 — 2026-05-15):
 *
 *  1. `?redirect=<safe-path>` honoured first via `safeRedirectPath` (open-redirect
 *     guarded — only single-leading-slash in-app paths survive).
 *  2. No `?redirect=` → `trpc.auth.defaultLandingRoute` resolves the user's
 *     oldest non-archived workspace + its oldest non-archived accessible board
 *     and we go straight to `/workspaces/[w]/boards/[b]`.
 *  3. Resolver returns `null` (0 workspaces, or 0 accessible non-archived
 *     boards) or errors → `/` fallback (workspace+pano seçici / onboarding).
 *
 * Kept in its own component so the layout doesn't need a `useSearchParams`
 * Suspense boundary unless a session actually exists.
 */
export function RedirectIfAuthenticated() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const rawRedirect = searchParams.get('redirect');
  const hasRedirectParam = rawRedirect !== null && rawRedirect !== '';

  // Only query the default landing when there's no explicit redirect target —
  // saves one round-trip on the common "redirect after expired session" path.
  const defaultLanding = useQuery({
    ...trpc.auth.defaultLandingRoute.queryOptions(),
    enabled: !hasRedirectParam,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (hasRedirectParam) {
      router.replace(safeRedirectPath(rawRedirect));
      return;
    }
    if (defaultLanding.isSuccess) {
      const route = defaultLanding.data;
      router.replace(
        route ? `/workspaces/${route.workspaceId}/boards/${route.boardId}` : '/',
      );
      return;
    }
    if (defaultLanding.isError) {
      router.replace('/');
    }
  }, [
    router,
    hasRedirectParam,
    rawRedirect,
    defaultLanding.isSuccess,
    defaultLanding.isError,
    defaultLanding.data,
  ]);

  return null;
}
