'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { env } from '@/env';
import { strings } from '@/lib/strings';
import { AuthShell } from '../(auth)/_components/auth-shell';

type BuildVerifyEmailUrlParams = {
  apiUrl: string;
  token: string;
  callbackURL: string;
};

export function buildVerifyEmailUrl({
  apiUrl,
  token,
  callbackURL,
}: BuildVerifyEmailUrlParams): string {
  const base = apiUrl.replace(/\/$/, '');
  return `${base}/api/auth/verify-email?token=${encodeURIComponent(
    token,
  )}&callbackURL=${encodeURIComponent(callbackURL)}`;
}

function VerifyEmailContent() {
  const copy = strings.auth.verifyEmail;
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const error = searchParams.get('error');

  useEffect(() => {
    if (!token) return;
    window.location.assign(
      buildVerifyEmailUrl({
        apiUrl: env.NEXT_PUBLIC_API_URL,
        token,
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
  }, [token]);

  if (token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.pendingTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.pendingBody}</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.invalidTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{copy.invalidBody}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.goToSignIn}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.successTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{copy.successBody}</p>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/"
          className="text-foreground rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {copy.goToApp}
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AppSpinner label={strings.common.loading} showLabel />}>
        <VerifyEmailContent />
      </Suspense>
    </AuthShell>
  );
}
