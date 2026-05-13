'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Button } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AddListForm } from './add-list-form';

type AddListColumnProps = {
  boardId: string;
};

/**
 * Trailing "add a list" column. Wires `list.create` and, on success, invalidates
 * `board.get` so the new column appears. Only rendered by the board when the
 * viewer may edit and the board is active.
 */
export function AddListColumn({ boardId }: AddListColumnProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const createList = useMutation(
    trpc.list.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
      },
    }),
  );

  return (
    <section
      className="flex w-72 shrink-0 flex-col gap-2 self-start rounded-lg border border-dashed bg-muted/30 p-2"
      aria-label={strings.board.column.addList}
    >
      {open ? (
        <div className="rounded-md bg-card p-2 shadow-sm">
          <AddListForm
            variant="compact"
            onSubmit={(title) =>
              createList.mutate({ boardId, title, clientMutationId: crypto.randomUUID() })
            }
            onSubmitted={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            pending={createList.isPending}
            error={
              createList.isError ? createList.error.message || strings.common.unknownError : null
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
