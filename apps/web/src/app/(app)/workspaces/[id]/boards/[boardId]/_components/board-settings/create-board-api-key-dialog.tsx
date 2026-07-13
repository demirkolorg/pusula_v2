'use client';

import { useId, useState } from 'react';
import { BotIcon, CopyIcon, KeyRoundIcon } from 'lucide-react';
import { API_KEY_ROLES, type ApiKeyRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  toast,
} from '@pusula/ui';
import { parseDateInputValue } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';

/** The plain token + its identity — shown once, right after a successful create. */
export type CreatedApiKeyToken = {
  token: string;
  name: string;
  tokenPrefix: string;
};

type CreateBoardApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when the operator submits the form (only in the form view). */
  onSubmit: (input: { name: string; role: ApiKeyRole; expiresAt?: Date }) => void;
  /** Create mutation in flight — locks the form + prevents closing. */
  pending?: boolean;
  /** Server-side error to surface inline in the form. */
  error?: string | null;
  /**
   * Set by the container after `create` resolves — switches the dialog from the
   * form to the one-time token reveal. `null` → the form is shown.
   */
  createdToken: CreatedApiKeyToken | null;
};

/**
 * Two-phase "new API key" dialog. Phase 1 is the create form (bot name + role +
 * optional expiry). Phase 2 — once the container passes a `createdToken` — is the
 * single reveal of the plain token (monospace box + copy + "won't be shown
 * again" warning). Closing the dialog clears the token in the container so it
 * never reappears. Presentational: the container wires the mutation + owns the
 * `createdToken`/`open` state. shadcn/ui + lucide only; all copy via `strings`.
 */
export function CreateBoardApiKeyDialog({
  open,
  onOpenChange,
  onSubmit,
  pending = false,
  error,
  createdToken,
}: CreateBoardApiKeyDialogProps) {
  const nameId = useId();
  const roleId = useId();
  const expiresId = useId();
  const copy = strings.board.settings;

  const [name, setName] = useState('');
  const [role, setRole] = useState<ApiKeyRole>('member');
  const [expires, setExpires] = useState('');

  const resetForm = () => {
    setName('');
    setRole('member');
    setExpires('');
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const expiresAt = expires ? (parseDateInputValue(expires) ?? undefined) : undefined;
    onSubmit({ name: trimmed, role, ...(expiresAt ? { expiresAt } : {}) });
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await window.navigator.clipboard.writeText(createdToken.token);
      toast.success(copy.apiKeyTokenCopied);
    } catch {
      toast.error(copy.apiKeyTokenCopyError);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The form resets when the dialog opens fresh; the container clears the
        // revealed token on close so it never reappears.
        if (next && !createdToken) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        {createdToken ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRoundIcon className="size-4" aria-hidden />
                {copy.apiKeyTokenTitle}
              </DialogTitle>
              <DialogDescription>{createdToken.name}</DialogDescription>
            </DialogHeader>

            <Alert variant="destructive">
              <AlertDescription>{copy.apiKeyTokenWarning}</AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <span className="text-muted-foreground block text-xs font-medium">
                {copy.apiKeyTokenLabel}
              </span>
              <div className="flex items-center gap-2">
                <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-sm select-all">
                  {createdToken.token}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy()}
                >
                  <CopyIcon className="size-3.5" aria-hidden />
                  {copy.apiKeyTokenCopy}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {copy.apiKeyTokenDone}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BotIcon className="size-4" aria-hidden />
                {copy.apiKeyCreateTitle}
              </DialogTitle>
              <DialogDescription>{copy.apiKeyCreateDescription}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor={nameId}>{copy.apiKeyNameLabel}</Label>
                <Input
                  id={nameId}
                  name="apiKeyName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={copy.apiKeyNamePlaceholder}
                  disabled={pending}
                  autoComplete="off"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={roleId}>{copy.apiKeyRoleLabel}</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as ApiKeyRole)}
                  disabled={pending}
                >
                  <SelectTrigger id={roleId} aria-label={copy.apiKeyRoleLabel}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {boardRoleLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={expiresId}>{copy.apiKeyExpiresLabel}</Label>
                <Input
                  id={expiresId}
                  name="apiKeyExpires"
                  type="date"
                  value={expires}
                  onChange={(event) => setExpires(event.target.value)}
                  disabled={pending}
                  className={cn('max-w-xs')}
                />
                <p className="text-muted-foreground text-xs">{copy.apiKeyExpiresHint}</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  {strings.common.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? copy.apiKeyCreating : copy.apiKeyCreateSubmit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
