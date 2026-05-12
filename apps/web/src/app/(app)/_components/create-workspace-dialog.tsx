'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceNameSchema } from '@pusula/domain';
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

/** "Yeni workspace" trigger + dialog. Creates a workspace, then invalidates the list. */
export function CreateWorkspaceDialog() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const nameId = useId();
  const copy = strings.workspace.create;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
        resetAndClose();
      },
    }),
  );

  const resetAndClose = () => {
    setName('');
    setNameError(null);
    createWorkspace.reset();
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = workspaceNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setNameError(null);
    createWorkspace.mutate({ name: parsed.data, clientMutationId: crypto.randomUUID() });
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
        <Button size="sm">{strings.workspace.newButton}</Button>
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
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.namePlaceholder}
              disabled={createWorkspace.isPending}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
            />
            {nameError && (
              <p id={`${nameId}-error`} className="text-destructive text-sm">
                {nameError}
              </p>
            )}
          </div>

          {createWorkspace.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {createWorkspace.error.message || strings.common.unknownError}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={createWorkspace.isPending}>
                {strings.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
