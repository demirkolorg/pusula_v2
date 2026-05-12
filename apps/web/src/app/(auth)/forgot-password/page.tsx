'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { ForgotPasswordForm } from '../_components/forgot-password-form';

/**
 * `(auth)/forgot-password` — request a password-reset link. Calls Better Auth's
 * `requestPasswordReset` directly (no tRPC; mirrors the profile/account flows —
 * see `docs/architecture/07-auth.md` "Şifre sıfırlama akışı" and
 * `docs/architecture/08-web-ve-mobil.md` §8.1.1). The reset link points back at
 * `(auth)/reset-password?token=…` (`redirectTo`); the email itself is sent by
 * the API server via Resend.
 *
 * Privacy: success and failure render the *same* state — we never reveal whether
 * an address has an account (Better Auth also returns silently when it doesn't),
 * so the request result (error or not) just flips us to the "if that address has
 * an account, a link is on its way" message.
 *
 * The `(auth)` layout already redirects signed-in users away from this page.
 */
export default function ForgotPasswordPage() {
  const copy = strings.auth.forgotPassword;
  const [pending, setPending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSubmit = async (email: string) => {
    setPending(true);
    try {
      // Deliberately ignore the result: whether it errors or not, we show the
      // same neutral "check your inbox" state (no account-existence oracle).
      //
      // `redirectTo` must be an *absolute* URL on the *web app* origin: Better
      // Auth resolves `redirectTo` server-side against its own `baseURL`, which
      // here is `env.API_URL` (`:3001`), not the web app. A relative
      // `/reset-password` would therefore produce a link to the API server,
      // which has no such route. Passing the web origin explicitly makes Better
      // Auth ignore its base and mint `${origin}/reset-password?token=…` — and
      // `apps/api/src/auth.ts` lists `env.APP_URL` in `trustedOrigins`, so the
      // origin check passes. (`'use client'`, so `window.location.origin` is
      // available and is exactly the web app's origin.)
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Same — swallow and fall through to the success state.
    } finally {
      setPending(false);
      setSubmittedEmail(email);
    }
  };

  if (submittedEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.successTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              {copy.successBodyPrefix}
              <span className="font-medium break-all">{submittedEmail}</span>
              {copy.successBodySuffix}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setSubmittedEmail(null)}
          >
            {copy.resend}
          </Button>
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground rounded-md text-center text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.backToSignIn}
          </Link>
        </CardFooter>
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
        <ForgotPasswordForm onSubmit={handleSubmit} pending={pending} />
      </CardContent>
      <CardFooter className="justify-center">
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
