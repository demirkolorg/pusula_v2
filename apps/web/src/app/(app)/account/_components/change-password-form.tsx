'use client';

import { useId, useState } from 'react';
import { changePasswordInput } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

type ChangePasswordFormProps = {
  pending: boolean;
  /** Server-side error (from Better Auth `changePassword`, e.g. wrong current password). */
  error?: string | null;
  /** Set after a successful change — shows the "parolan değiştirildi" notice. */
  success?: boolean;
  onSubmit: (values: { currentPassword: string; newPassword: string }) => void;
};

/**
 * Presentational change-password form (current + new + confirm). No auth-client
 * dependency — `account/page.tsx` wires that in. `currentPassword` is also
 * verified server-side by Better Auth; here we only enforce the shared
 * `@pusula/domain` rules (length, "must differ") plus the confirm match.
 */
export function ChangePasswordForm({ pending, error, success, onSubmit }: ChangePasswordFormProps) {
  const copy = strings.account.password;
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};

    const parsed = changePasswordInput.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'currentPassword' || key === 'newPassword') next[key] ??= issue.message;
      }
    }
    if (newPassword !== confirmPassword) next.confirmPassword ??= copy.mismatch;

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onSubmit({ currentPassword, newPassword });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={currentId}>{copy.currentLabel}</Label>
            <Input
              id={currentId}
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder={copy.placeholder}
              disabled={pending}
              autoComplete="current-password"
              aria-invalid={fieldErrors.currentPassword ? true : undefined}
              aria-describedby={fieldErrors.currentPassword ? `${currentId}-error` : undefined}
            />
            {fieldErrors.currentPassword && (
              <p id={`${currentId}-error`} className="text-destructive text-sm">
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={newId}>{copy.newLabel}</Label>
            <Input
              id={newId}
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={copy.placeholder}
              disabled={pending}
              autoComplete="new-password"
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
            <Label htmlFor={confirmId}>{copy.confirmLabel}</Label>
            <Input
              id={confirmId}
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={copy.placeholder}
              disabled={pending}
              autoComplete="new-password"
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
          {success && (
            <Alert>
              <AlertDescription>{copy.saved}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? copy.saving : copy.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
