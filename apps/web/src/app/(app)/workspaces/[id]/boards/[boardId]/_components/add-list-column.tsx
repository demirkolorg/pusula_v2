'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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

  const createList = useMutation(
    trpc.list.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
      },
    }),
  );

  return (
    <section
      className="bg-muted/30 flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-dashed p-2"
      aria-label={strings.board.column.addList}
    >
      <p className="text-muted-foreground px-1 text-sm font-medium">{strings.board.column.addList}</p>
      <AddListForm
        onSubmit={(title) =>
          createList.mutate({ boardId, title, clientMutationId: crypto.randomUUID() })
        }
        pending={createList.isPending}
        error={createList.isError ? createList.error.message || strings.common.unknownError : null}
      />
    </section>
  );
}
