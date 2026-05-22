'use client';

import { useId, useState } from 'react';
import { forgotPasswordInput } from '@pusula/domain';
import { Button, Input, Label } from '@pusula/ui';
import { strings } from '@/lib/strings';

type ForgotPasswordFormProps = {
  /** Called with the validated, normalized email (trimmed + lower-cased). */
  onSubmit: (email: string) => void;
  /** Async work in flight — disables the input and the submit button. */
  pending?: boolean;
};

/**
 * Presentational "forgot password" form (just an email). No router / auth-client
 * dependency — the multi-mode glass card (`sign-in-glass-card.tsx`) wires
 * `authClient.requestPasswordReset` in. Validation uses the shared
 * `@pusula/domain` `forgotPasswordInput` schema so the rules match the server.
 *
 * Note: there's intentionally no inline server-error surface here — the card
 * shows the *same* success state whether or not the email exists (we never
 * reveal whether an address has an account), so a failed request still lands on
 * the "if that address has an account, a link is on its way" message.
 */
export function ForgotPasswordForm({ onSubmit, pending = false }: ForgotPasswordFormProps) {
  const copy = strings.auth.forgotPassword;
  const emailId = useId();
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = forgotPasswordInput.safeParse({ email: String(form.get('email') ?? '') });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === 'email');
      setEmailError(issue?.message ?? strings.common.unknownError);
      return;
    }
    setEmailError(undefined);
    onSubmit(parsed.data.email);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={emailId}>{strings.auth.emailLabel}</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder={strings.auth.emailPlaceholder}
          disabled={pending}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
        />
        {emailError && (
          <p id={`${emailId}-error`} className="text-destructive text-sm">
            {emailError}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
