'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

type ArchiveBoardDialogProps = {
  boardId: string;
  /** Current archived state — drives "archive" vs. "restore" copy/behaviour. */
  archived: boolean;
};

/**
 * Archive / restore a board. Board `admin` only (the page gates this; the server
 * still enforces it on `board.archive`). Archiving asks for a small confirmation;
 * restoring is one click. On success invalidates `board.get` so the read-only
 * state updates.
 */
export function ArchiveBoardDialog({ boardId, archived }: ArchiveBoardDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const copy = strings.board.detail;

  const archiveBoard = useMutation(
    trpc.board.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        setOpen(false);
      },
    }),
  );

  // Restoring is low-risk — a plain button, no confirmation dialog.
  if (archived) {
    return (
      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={archiveBoard.isPending}
          onClick={() =>
            archiveBoard.mutate({ boardId, archived: false, clientMutationId: crypto.randomUUID() })
          }
        >
          {archiveBoard.isPending ? copy.restoring : copy.restore}
        </Button>
        {archiveBoard.isError && (
          <p className="text-destructive text-sm">
            {archiveBoard.error.message || strings.common.unknownError}
          </p>
        )}
      </div>
    );
  }

  const handleOpenChange = (next: boolean) => {
    if (archiveBoard.isPending) return;
    setOpen(next);
    if (!next) archiveBoard.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {copy.archive}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.archiveConfirmTitle}</DialogTitle>
          <DialogDescription>{copy.archiveConfirmDescription}</DialogDescription>
        </DialogHeader>

        {archiveBoard.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {archiveBoard.error.message || strings.common.unknownError}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={archiveBoard.isPending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={archiveBoard.isPending}
            onClick={() =>
              archiveBoard.mutate({ boardId, archived: true, clientMutationId: crypto.randomUUID() })
            }
          >
            {archiveBoard.isPending ? copy.archiving : copy.archiveConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
