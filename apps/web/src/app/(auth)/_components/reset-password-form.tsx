'use client';

import { useId, useState } from 'react';
import { resetPasswordInput } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, Label } from '@pusula/ui';
import { strings } from '@/lib/strings';

type ResetPasswordFormProps = {
  /** The one-time token read from the reset link's `?token=` query param. */
  token: string;
  /** Called with the (already-validated) new password — the page submits it to Better Auth. */
  onSubmit: (newPassword: string) => void;
  /** Async work in flight — disables inputs and the submit button. */
  pending?: boolean;
  /** Server-side error (e.g. token expired / already used) to surface inline. */
  error?: string | null;
};

/**
 * Presentational "reset password" form (new password + confirm). No router /
 * auth-client dependency — `reset-password/page.tsx` wires `authClient.resetPassword`
 * in and handles the token. Validation uses the shared `@pusula/domain`
 * `resetPasswordInput` schema (so the password rule matches the server) plus a
 * client-side confirm-match check.
 */
export function ResetPasswordForm({ token, onSubmit, pending = false, error }: ResetPasswordFormProps) {
  const copy = strings.auth.resetPassword;
  const newId = useId();
  const confirmId = useId();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string; confirmPassword?: string }>(
    {},
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: { newPassword?: string; confirmPassword?: string } = {};

    const parsed = resetPasswordInput.safeParse({ token, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'newPassword') next.newPassword ??= issue.message;
      }
    }
    if (newPassword !== confirmPassword) next.confirmPassword ??= copy.passwordMismatch;

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onSubmit(newPassword);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={newId}>{copy.newPasswordLabel}</Label>
        <Input
          id={newId}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder={copy.passwordPlaceholder}
          disabled={pending}
          aria-invalid={fieldErrors.newPassword ? true : undefined}
          aria-describedby={fieldErrors.newPassword ? `${newId}-error` : undefined}
        />
        {fieldErrors.newPassword && (
          <p id={`${newId}-error`} className="text-destructive text-sm">
            {fieldErrors.newPassword}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={confirmId}>{copy.confirmPasswordLabel}</Label>
        <Input
          id={confirmId}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder={copy.passwordPlaceholder}
          disabled={pending}
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={fieldErrors.confirmPassword ? `${confirmId}-error` : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id={`${confirmId}-error`} className="text-destructive text-sm">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
