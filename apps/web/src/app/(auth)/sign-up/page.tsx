'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { AuthForm, type AuthFormValues } from '../_components/auth-form';

function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async ({ name, email, password }: AuthFormValues) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signUp.email({ name: name ?? '', email, password });
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

  return <AuthForm variant="sign-up" onSubmit={handleSubmit} pending={pending} error={error} />;
}

export default function SignUpPage() {
  const copy = strings.auth.signUp;
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {copy.title}
        </h1>
        <p className="text-muted-foreground text-sm">{copy.description}</p>
      </div>

      <div>
        <SignUpForm />
      </div>

      <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 text-center text-sm">
        <span>
          {copy.hasAccount}{' '}
          <Link
            href="/sign-in"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {copy.goToSignIn}
          </Link>
        </span>
      </div>
    </div>
  );
}
