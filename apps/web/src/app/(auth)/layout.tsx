'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { authClient } from '@/lib/auth-client';
import { AuthShell } from './_components/auth-shell';
import { RedirectIfAuthenticated } from './_components/redirect-if-authenticated';

/**
 * Public auth shell (sign-in / sign-up). Once a session resolves there's nothing
 * to sign into, so we hand off to {@link RedirectIfAuthenticated} (which honours
 * `?redirect=`). While the session is still resolving we render children so the
 * form paints immediately on cold loads.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (!isPending && session) {
    return (
      <Suspense fallback={null}>
        <RedirectIfAuthenticated />
      </Suspense>
    );
  }

  return <AuthShell>{children}</AuthShell>;
}
