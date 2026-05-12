'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { ResetPasswordForm } from '../_components/reset-password-form';

/**
 * `(auth)/reset-password` — set a new password using the one-time `?token=` from
 * the reset link. Calls Better Auth's `resetPassword` directly (no tRPC; see
 * `docs/architecture/07-auth.md` "Şifre sıfırlama akışı" and
 * `docs/architecture/08-web-ve-mobil.md` §8.1.1).
 *
 * No token / empty token → "invalid link" state with a link back to
 * `/forgot-password`. On success → redirect to `/sign-in?reset=1` (the sign-in
 * page surfaces a "parolan güncellendi" notice). Better Auth errors (expired /
 * used / invalid token) → inline error + "request a new link".
 *
 * `useSearchParams` requires a `<Suspense>` boundary in the App Router, so the
 * page splits into a `<Suspense>` wrapper + the actual `ResetPasswordContent`.
 * The `(auth)` layout already redirects signed-in users away from here.
 */
function ResetPasswordContent() {
  const copy = strings.auth.resetPassword;
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.missingTokenTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{copy.missingTokenBody}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex-col items-center gap-2">
          <Link
            href="/forgot-password"
            className="text-foreground rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.requestNewLink}
          </Link>
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.backToSignIn}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  const handleSubmit = async (newPassword: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) {
        setError(result.error.message ?? strings.common.unknownError);
        setPending(false);
        return;
      }
      setDone(true);
      router.push('/sign-in?reset=1');
    } catch {
      setError(strings.common.unknownError);
      setPending(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.successTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.redirecting}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} onSubmit={handleSubmit} pending={pending} error={error} />
      </CardContent>
      <CardFooter className="justify-center">
        {error ? (
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.requestNewLink}
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.backToSignIn}
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">{strings.common.loading}</p>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
