'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
  DialogTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type ArchiveWorkspaceDialogProps = {
  workspaceId: string;
  /** Called once the workspace is archived — caller invalidates `workspace.list` and navigates away. */
  onArchived: () => void | Promise<void>;
};

/**
 * "Archive workspace" trigger + confirmation dialog. Owner-only (the page gates
 * this; the server still enforces it on `workspace.archive`). On success the
 * caller handles cache invalidation + navigation, so this component just fires
 * the mutation and reports the result.
 */
export function ArchiveWorkspaceDialog({ workspaceId, onArchived }: ArchiveWorkspaceDialogProps) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const archiveWorkspace = useMutation(
    trpc.workspace.archive.mutationOptions({
      onSuccess: async () => {
        await onArchived();
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (archiveWorkspace.isPending) return;
    setOpen(next);
    if (!next) archiveWorkspace.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">{strings.workspace.manage.archiveButton}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{strings.workspace.manage.archiveConfirmTitle}</DialogTitle>
          <DialogDescription>
            {strings.workspace.manage.archiveConfirmDescription}
          </DialogDescription>
        </DialogHeader>

        {archiveWorkspace.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {archiveWorkspace.error.message || strings.common.unknownError}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={archiveWorkspace.isPending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={archiveWorkspace.isPending}
            onClick={() =>
              archiveWorkspace.mutate({ workspaceId, clientMutationId: crypto.randomUUID() })
            }
          >
            {archiveWorkspace.isPending
              ? strings.workspace.manage.archiving
              : strings.workspace.manage.archiveConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
