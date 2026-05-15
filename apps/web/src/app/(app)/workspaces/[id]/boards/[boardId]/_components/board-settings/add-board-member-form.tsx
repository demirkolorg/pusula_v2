'use client';

import { useId, useState } from 'react';
import { BOARD_ROLES, emailSchema, type BoardRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pusula/ui';
import { boardRoleLabels, strings } from '@/lib/strings';

const ADD_ROLES = BOARD_ROLES as readonly BoardRole[];

type AddBoardMemberFormProps = {
  /** Called with the validated, normalized (trimmed + lower-cased) e-mail + the chosen role. */
  onSubmit: (input: { email: string; role: BoardRole }) => void;
  /** Mutation in flight — disables the inputs and button. */
  pending?: boolean;
  /** Server-side error to surface inline (e.g. CONFLICT — already a member / already invited). */
  error?: string | null;
  /** Inline success notice (set by the container after `board.members.add` resolves). */
  notice?: string | null;
};

/**
 * Presentational "add a board member" form: an e-mail field + a role <Select> +
 * submit. No tRPC / query-client dependency — the section container wires those
 * in and maps the server's `kind` result (`added` / `added_as_guest` / `invited`)
 * to `notice`. Validation uses the shared `@pusula/domain` `emailSchema` so the
 * rule matches the server (which also normalizes the address).
 */
export function AddBoardMemberForm({
  onSubmit,
  pending = false,
  error,
  notice,
}: AddBoardMemberFormProps) {
  const emailId = useId();
  const roleId = useId();
  const copy = strings.board.settings;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BoardRole>('member');
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setEmailError(null);
    onSubmit({ email: parsed.data, role });
    setEmail('');
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor={emailId}>{copy.addEmailLabel}</Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.addEmailPlaceholder}
            disabled={pending}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${emailId}-error` : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={roleId}>{copy.addRoleLabel}</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as BoardRole)}
            disabled={pending}
          >
            <SelectTrigger id={roleId} aria-label={copy.addRoleLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADD_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {boardRoleLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? copy.addSubmitting : copy.addSubmit}
        </Button>
      </div>

      {emailError && (
        <p id={`${emailId}-error`} className="text-destructive text-sm">
          {emailError}
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && <p className="text-muted-foreground text-sm">{notice}</p>}
    </form>
  );
}
