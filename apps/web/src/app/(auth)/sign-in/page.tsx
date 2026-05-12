'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { AuthForm, type AuthFormValues } from '../_components/auth-form';

function SignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async ({ email, password }: AuthFormValues) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? strings.common.unknownError);
      }
      // On success, the `(auth)` layout sees the new session and redirects
      // (honouring `?redirect=`) — see RedirectIfAuthenticated.
    } catch {
      setError(strings.common.unknownError);
    } finally {
      setPending(false);
    }
  };

  return <AuthForm variant="sign-in" onSubmit={handleSubmit} pending={pending} error={error} />;
}

function SignInContent() {
  const copy = strings.auth.signIn;
  const searchParams = useSearchParams();
  // Flash after a successful password reset (`/sign-in?reset=1` from
  // `(auth)/reset-password`). Purely informational; no state to clear.
  const justReset = searchParams.get('reset') === '1';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {justReset && (
          <Alert>
            <AlertDescription>{copy.resetDone}</AlertDescription>
          </Alert>
        )}
        <SignInForm />
        <p className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.forgotPassword}
          </Link>
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-muted-foreground text-sm">
          {copy.noAccount}{' '}
          <Link
            href="/sign-up"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {copy.goToSignUp}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">{strings.common.loading}</p>}
    >
      <SignInContent />
    </Suspense>
  );
}
