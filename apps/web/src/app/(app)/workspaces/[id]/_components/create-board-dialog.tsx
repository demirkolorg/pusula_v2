'use client';

import { useId, useState } from 'react';
import { boardTitleSchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  type ButtonProps,
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
  toast,
} from '@pusula/ui';
import {
  getMutationErrorMessage,
  useOptimisticBoardListMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type CreateBoardDialogProps = {
  workspaceId: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerClassName?: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * "Pano oluştur" trigger + dialog. `board.create` runs through the workspace
 * board-list optimistic hook (Phase 4C — DEM-80): no optimistic insert (the
 * server picks the id), but `clientMutationId` injection + error toast +
 * CONFLICT refetch + invalidate-on-settle all go through the shared hook.
 */
export function CreateBoardDialog({
  workspaceId,
  triggerLabel,
  triggerVariant,
  triggerClassName,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: CreateBoardDialogProps) {
  const trpc = useTRPC();
  const nameId = useId();
  const copy = strings.board.create;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setDialogOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  const resetAndClose = () => {
    setTitle('');
    setTitleError(null);
    createBoard.reset();
    setDialogOpen(false);
  };

  const createBoard = useOptimisticBoardListMutation({
    mutationOptions: trpc.board.create.mutationOptions,
    workspaceId,
    apply: (boards) => boards,
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
    onMutationSuccess: () => resetAndClose(),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = boardTitleSchema.safeParse(title);
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setTitleError(null);
    createBoard.mutate({ workspaceId, title: parsed.data });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDialogOpen(true);
        else resetAndClose();
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button size="sm" variant={triggerVariant} className={triggerClassName}>
            {triggerLabel ?? strings.board.newButton}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent closeLabel={strings.common.close}>
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
                {getMutationErrorMessage(createBoard) ?? strings.common.unknownError}
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
