'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardTitleSchema } from '@pusula/domain';
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
  Input,
  Label,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type CreateBoardDialogProps = {
  workspaceId: string;
};

/** "Pano oluştur" trigger + dialog. Creates a board, then invalidates `board.list`. */
export function CreateBoardDialog({ workspaceId }: CreateBoardDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const nameId = useId();
  const copy = strings.board.create;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.list.queryFilter({ workspaceId }));
        resetAndClose();
      },
    }),
  );

  const resetAndClose = () => {
    setTitle('');
    setTitleError(null);
    createBoard.reset();
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = boardTitleSchema.safeParse(title);
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setTitleError(null);
    createBoard.mutate({ workspaceId, title: parsed.data, clientMutationId: crypto.randomUUID() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else resetAndClose();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">{strings.board.newButton}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>{copy.nameLabel}</Label>
            <Input
              id={nameId}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={copy.namePlaceholder}
              disabled={createBoard.isPending}
              autoComplete="off"
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? `${nameId}-error` : undefined}
            />
            {titleError && (
              <p id={`${nameId}-error`} className="text-destructive text-sm">
                {titleError}
              </p>
            )}
          </div>

          {createBoard.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {createBoard.error.message || strings.common.unknownError}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={createBoard.isPending}>
                {strings.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createBoard.isPending}>
              {createBoard.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
