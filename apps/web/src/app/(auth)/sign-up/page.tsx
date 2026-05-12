'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@pusula/ui';
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
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-muted-foreground text-sm">
          {copy.hasAccount}{' '}
          <Link
            href="/sign-in"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {copy.goToSignIn}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
