'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button, toast } from '@pusula/ui';
import { getMutationErrorMessage, useOptimisticBoardMutation } from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AddListForm } from './add-list-form';

type AddListColumnProps = {
  boardId: string;
};

/**
 * Trailing "add a list" column. Wires `list.create` through
 * `useOptimisticBoardMutation` (Phase 4C — DEM-80): no optimistic insert (the
 * server picks the id + tail position; we let the settle-time invalidate fill
 * the new column in), but the mutation lifecycle — `clientMutationId`
 * injection, error toast, CONFLICT refetch — runs through the shared hook.
 * Only rendered by the board when the viewer may edit and the board is active.
 */
export function AddListColumn({ boardId }: AddListColumnProps) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const createList = useOptimisticBoardMutation({
    mutationOptions: trpc.list.create.mutationOptions,
    boardId,
    apply: (data) => data,
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
  });

  return (
    <section
      className="flex w-72 shrink-0 flex-col gap-2 self-start rounded-lg border border-dashed bg-muted/30 p-2"
      aria-label={strings.board.column.addList}
    >
      {open ? (
        <div className="rounded-md bg-card p-2 shadow-sm">
          <AddListForm
            variant="compact"
            onSubmit={(title) => createList.mutate({ boardId, title })}
            onSubmitted={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            pending={createList.isPending}
            error={
              createList.isError
                ? (getMutationErrorMessage(createList) ?? strings.common.unknownError)
                : null
            }
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-9 w-full justify-start text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PlusIcon className="size-4" />
          {strings.board.column.addList}
        </Button>
      )}
    </section>
  );
}
