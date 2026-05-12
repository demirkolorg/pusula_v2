'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { deleteAccountInput } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

type DeleteAccountSectionProps = {
  /**
   * How many workspaces the signed-in user owns. While this is > 0 the account
   * can't be deleted (the server's `beforeDelete` hook enforces it; this is the
   * UI hint). Pass 0 if unknown — the server still has the final say.
   */
  ownedWorkspaceCount: number;
  pending: boolean;
  /** Server-side error (from Better Auth `deleteUser`) to surface in the dialog. */
  error?: string | null;
  onDelete: (password: string) => void;
};

/**
 * "Tehlikeli bölge" — delete account. When the user still owns a workspace we
 * show an explanation + a link to the workspace list instead of the delete
 * affordance (ownership transfer isn't a thing yet). Otherwise: a destructive
 * button that opens a password-confirmation dialog. No auth-client dependency —
 * `account/page.tsx` wires `onDelete` in.
 */
export function DeleteAccountSection({
  ownedWorkspaceCount,
  pending,
  error,
  onDelete,
}: DeleteAccountSectionProps) {
  const copy = strings.account.danger;
  const passwordId = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const blocked = ownedWorkspaceCount > 0;

  const reset = () => {
    setPassword('');
    setPasswordError(null);
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = deleteAccountInput.safeParse({ password });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setPasswordError(null);
    onDelete(parsed.data.password);
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocked ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.blockedOwnerTitle}</AlertTitle>
            <AlertDescription>
              <p>{copy.blockedOwnerDescription}</p>
              <Link
                href="/"
                className="focus-visible:ring-ring/60 inline-flex rounded-md underline underline-offset-4 outline-none focus-visible:ring-2"
              >
                {copy.goToWorkspaces}
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (next) setOpen(true);
              else reset();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">{copy.deleteAction}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={strings.common.close}>
              <DialogHeader>
                <DialogTitle>{copy.dialogTitle}</DialogTitle>
                <DialogDescription>{copy.dialogDescription}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={passwordId}>{copy.passwordLabel}</Label>
                  <Input
                    id={passwordId}
                    name="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    disabled={pending}
                    autoComplete="current-password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? `${passwordId}-error` : undefined}
                  />
                  {passwordError && (
                    <p id={`${passwordId}-error`} className="text-destructive text-sm">
                      {passwordError}
                    </p>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={pending}>
                      {strings.common.cancel}
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="destructive" disabled={pending}>
                    {pending ? copy.deleting : copy.confirm}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
