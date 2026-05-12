'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

// ---------------------------------------------------------------------------
// Presentational sub-component — no tRPC/router/Dialog deps, easy to unit-test.
// ---------------------------------------------------------------------------

type DeleteWorkspaceFormProps = {
  workspaceName: string;
  onConfirm: (confirmName: string) => void;
  onCancel?: () => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * "Confirm delete" form: a name-match input + destructive submit. Purely
 * presentational — the dialog wrapper wires mutations and cancel behaviour.
 */
export function DeleteWorkspaceForm({
  workspaceName,
  onConfirm,
  onCancel,
  pending = false,
  error,
}: DeleteWorkspaceFormProps) {
  const inputId = useId();
  const copy = strings.workspace.manage;
  const [confirmName, setConfirmName] = useState('');

  const canSubmit = confirmName.trim() === workspaceName && !pending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onConfirm(confirmName.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={inputId}>{copy.deleteConfirmNameLabel}</Label>
        <p id={`${inputId}-hint`} className="text-muted-foreground text-sm">
          {copy.deleteConfirmNamePrompt}{' '}
          <strong className="text-foreground">{workspaceName}</strong>
        </p>
        <Input
          id={inputId}
          name="confirmName"
          type="text"
          autoComplete="off"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          placeholder={workspaceName}
          disabled={pending}
          aria-describedby={`${inputId}-hint`}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {strings.common.cancel}
          </Button>
        )}
        <Button type="submit" variant="destructive" disabled={!canSubmit}>
          {pending ? copy.deleting : copy.deleteConfirm}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell — wires tRPC mutation, router, queryClient.
// ---------------------------------------------------------------------------

type DeleteWorkspaceDialogProps = {
  workspaceId: string;
  workspaceName: string;
};

/**
 * "Delete workspace" trigger + confirmation dialog. Owner-only (the page gates
 * this; the server still enforces it on `workspace.delete`). On success
 * navigates to `/` and invalidates `workspace.list`.
 */
export function DeleteWorkspaceDialog({ workspaceId, workspaceName }: DeleteWorkspaceDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const copy = strings.workspace.manage;

  const deleteWorkspace = useMutation(
    trpc.workspace.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
        router.replace('/');
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (deleteWorkspace.isPending) return;
    setOpen(next);
    if (!next) deleteWorkspace.reset();
  };

  const handleConfirm = (confirmName: string) => {
    deleteWorkspace.mutate({
      workspaceId,
      confirmName,
      clientMutationId: crypto.randomUUID(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">{copy.deleteAction}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.deleteDialogTitle}</DialogTitle>
          <DialogDescription>{copy.deleteDialogDescription}</DialogDescription>
        </DialogHeader>

        <DeleteWorkspaceForm
          workspaceName={workspaceName}
          onConfirm={handleConfirm}
          onCancel={() => handleOpenChange(false)}
          pending={deleteWorkspace.isPending}
          error={
            deleteWorkspace.isError
              ? (deleteWorkspace.error.message || strings.common.unknownError)
              : null
          }
        />
      </DialogContent>
    </Dialog>
  );
}
