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
  /**
   * Optionally control the dialog open state from the outside (e.g. a board
   * top-bar "⋮" menu item). When omitted, the component owns its own state and
   * shows a built-in trigger button.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in trigger button (for fully external triggers). */
  hideTrigger?: boolean;
};

/**
 * Archive / restore a board. Board `admin` only (the caller gates this; the
 * server still enforces it on `board.archive`). Archiving asks for a small
 * confirmation; restoring is one click. On success invalidates `board.get` so
 * the read-only state updates. The open state may be lifted via `open` /
 * `onOpenChange` (e.g. driven by a top-bar menu).
 */
export function ArchiveBoardDialog({
  boardId,
  archived,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: ArchiveBoardDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
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
    if (hideTrigger) return null;
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
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            {copy.archive}
          </Button>
        </DialogTrigger>
      )}
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

/**
 * Restore a board with a single click (the "low-risk" path, extracted so the
 * board top bar can wire it from a "⋮" menu item without rendering a button).
 * Returns the mutation so the caller can reflect pending/error state.
 */
export function useRestoreBoard(boardId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.board.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
      },
    }),
  );
}
