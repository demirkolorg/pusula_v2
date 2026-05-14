'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_WORKSPACE_ICON, workspaceNameSchema, type EntityIcon } from '@pusula/domain';
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
} from '@pusula/ui';
import { EntityIconPicker } from '@/components/entity-icon';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/**
 * "Yeni workspace" trigger + dialog. Creates a workspace, then invalidates the
 * list. `triggerLabel` overrides the trigger button text (the onboarding empty
 * state uses a more prominent label).
 */
type CreateWorkspaceDialogProps = {
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerClassName?: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CreateWorkspaceDialog({
  triggerLabel,
  triggerVariant,
  triggerClassName,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: CreateWorkspaceDialogProps = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const nameId = useId();
  const copy = strings.workspace.create;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setDialogOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<EntityIcon>(DEFAULT_WORKSPACE_ICON);
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
    setIcon(DEFAULT_WORKSPACE_ICON);
    setNameError(null);
    createWorkspace.reset();
    setDialogOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = workspaceNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setNameError(null);
    createWorkspace.mutate({ name: parsed.data, icon, clientMutationId: crypto.randomUUID() });
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
            {triggerLabel ?? strings.workspace.newButton}
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

          <div className="space-y-2">
            <Label>{copy.iconLabel}</Label>
            <EntityIconPicker
              value={icon}
              onValueChange={setIcon}
              labels={strings.entityIcons}
              disabled={createWorkspace.isPending}
            />
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
