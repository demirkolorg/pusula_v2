'use client';

import { useId, useState } from 'react';
import { emailSchema } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, Label } from '@pusula/ui';
import { strings } from '@/lib/strings';

type InviteMemberFormProps = {
  /** Called with the validated, normalized (trimmed + lower-cased) e-mail. */
  onSubmit: (email: string) => void;
  /** Cancel action — wired to the dialog's close button by the wrapper. */
  onCancel?: () => void;
  /** Mutation in flight — disables the input and buttons. */
  pending?: boolean;
  /** Server-side error message to surface inline (e.g. CONFLICT). */
  error?: string | null;
  /**
   * The signed-in user's own e-mail — passed by the dialog from `useSession`.
   * Used to block self-invite at the UI seam (DEM-298); server also rejects
   * with `BAD_REQUEST` for defense-in-depth.
   */
  currentUserEmail?: string;
};

/**
 * Presentational "invite a member" form: an e-mail field + submit. No tRPC /
 * query-client dependency — the dialog wrapper wires those in. Validation uses
 * the shared `@pusula/domain` `emailSchema` so the rule matches the server
 * (which also normalizes the address). Self-invite is rejected inline when the
 * caller types their own address (DEM-298).
 */
export function InviteMemberForm({
  onSubmit,
  onCancel,
  pending = false,
  error,
  currentUserEmail,
}: InviteMemberFormProps) {
  const emailId = useId();
  const copy = strings.invitations;
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    if (
      currentUserEmail &&
      parsed.data.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
    ) {
      setEmailError(strings.invitations.cannotInviteSelf);
      return;
    }
    setEmailError(null);
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={emailId}>{copy.inviteEmailLabel}</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={copy.inviteEmailPlaceholder}
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

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {strings.common.cancel}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? copy.inviteSubmitting : copy.inviteSubmit}
        </Button>
      </div>
    </form>
  );
}
