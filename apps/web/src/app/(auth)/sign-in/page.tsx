'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, AlertDescription } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
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

  return (
    <AuthForm
      variant="sign-in"
      onSubmit={handleSubmit}
      pending={pending}
      error={error}
      passwordAction={
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {strings.auth.signIn.forgotPassword}
        </Link>
      }
    />
  );
}

function SignInContent() {
  const copy = strings.auth.signIn;
  const searchParams = useSearchParams();
  // Flash after a successful password reset (`/sign-in?reset=1` from
  // `(auth)/reset-password`). Purely informational; no state to clear.
  const justReset = searchParams.get('reset') === '1';

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {copy.title}
        </h1>
        <p className="text-muted-foreground text-sm">{copy.description}</p>
      </div>

      <div className="space-y-4">
        {justReset && (
          <Alert>
            <AlertDescription>{copy.resetDone}</AlertDescription>
          </Alert>
        )}
        <SignInForm />
      </div>

      <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 text-center text-sm">
        <span>
          {copy.noAccount}{' '}
          <Link
            href="/sign-up"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {copy.goToSignUp}
          </Link>
        </span>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AppSpinner label={strings.common.loading} showLabel />}>
      <SignInContent />
    </Suspense>
  );
}
