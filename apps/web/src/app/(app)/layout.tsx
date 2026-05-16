'use client';

import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AppSpinner } from '@/components/app-spinner';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { AppShell } from './_components/app-shell';

/**
 * Protected shell. Session lives client-side (web and API are different origins,
 * so RSC can't read the API's cookie — see architecture §8.1.1). While the
 * session resolves we show a minimal placeholder; if there's no session we send
 * the user to sign-in, preserving where they were headed via `?redirect=`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isPending, session, router, pathname]);

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <AppSpinner label={strings.common.loading} showLabel />
      </div>
    );
  }

  if (!session) return null;

  return (
    <AppShell
      userName={session.user.name || session.user.email}
      userEmail={session.user.email}
      userImage={session.user.image ?? null}
      emailVerified={session.user.emailVerified}
    >
      {children}
    </AppShell>
  );
}
