'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@pusula/ui';
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

export default function SignInPage() {
  const copy = strings.auth.signIn;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
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
