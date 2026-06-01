'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
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
} from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * Generic rename dialog used by all 4 home-page row context menus
 * (workspace/board/list/card). Pure presentation — owns no mutation; the
 * caller wires `onSubmit` to its tRPC mutation and toggles `isPending`/`error`.
 *
 * UX guards:
 *  - Auto-focuses the input on open and pre-selects current text so power
 *    users can type-to-replace.
 *  - Submit is disabled while pending OR when the trimmed value is empty OR
 *    when it equals the current value (no-op).
 *  - Closing while pending is blocked (`onOpenChange` short-circuit) so the
 *    cache isn't left in an indeterminate "is the rename committed?" state.
 */
export type RowRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Localised entity label, e.g. "Pano" / "Liste" — used inside title text. */
  entityLabel: string;
  /** Current name; pre-filled into the input. */
  currentValue: string;
  /** Caller awaits the mutation and closes the dialog on resolution. */
  onSubmit: (nextValue: string) => void | Promise<void>;
  isPending: boolean;
  /** Optional mutation error message — surfaced inside the dialog. */
  errorMessage?: string | null;
};

export function RowRenameDialog({
  open,
  onOpenChange,
  entityLabel,
  currentValue,
  onSubmit,
  isPending,
  errorMessage,
}: RowRenameDialogProps) {
  const copy = strings.home.rowActions.rename_;
  const [value, setValue] = useState(currentValue);
  const inputId = useId();

  // Open transitions reset the field to the latest current value — re-opening
  // after an edit elsewhere keeps the form aligned with the cache.
  useEffect(() => {
    if (open) setValue(currentValue);
  }, [open, currentValue]);

  const trimmed = value.trim();
  const hasInput = trimmed.length > 0;
  const isUnchanged = trimmed === currentValue.trim();
  const disabled = isPending || !hasInput || isUnchanged;

  const handleOpenChange = (next: boolean) => {
    // Pending mutation locks the dialog open so the user doesn't dismiss a
    // half-submitted rename and end up unsure whether it landed.
    if (isPending) return;
    onOpenChange(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    await onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title(entityLabel)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>{copy.nameLabel}</Label>
            <Input
              id={inputId}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              disabled={isPending}
              required
            />
            {!hasInput && (
              <p className="text-destructive text-xs">{copy.emptyError}</p>
            )}
            {hasInput && isUnchanged && (
              <p className="text-muted-foreground text-xs">{copy.sameValueNote}</p>
            )}
          </div>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={disabled}>
              {isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Generic archive confirmation used by all 4 home-page row context menus.
 * Lightweight Dialog (not AlertDialog — UI package doesn't ship one) with a
 * destructive "Arşivle" action and a single cancel. Archive is reversible
 * (yöneticiler geri alabilir) so we keep the friction low; sensitive
 * irreversible flows (workspace delete) stay in their dedicated dialogs.
 */
export type RowArchiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  /** Caller awaits the mutation and closes the dialog on resolution. */
  onConfirm: () => void | Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
};

export function RowArchiveDialog({
  open,
  onOpenChange,
  entityLabel,
  onConfirm,
  isPending,
  errorMessage,
}: RowArchiveDialogProps) {
  const copy = strings.home.rowActions.archive_;
  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title(entityLabel)}</DialogTitle>
          <DialogDescription>{copy.description(entityLabel)}</DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isPending ? copy.archiving : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
