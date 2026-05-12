'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cardDescriptionSchema, cardTitleSchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { parseDateInputValue, toDateInputValue } from '@/lib/format';
import { useTRPC } from '@/trpc/client';

// ---------------------------------------------------------------------------
// Presentational form — no tRPC/Dialog deps, easy to unit-test.
// ---------------------------------------------------------------------------

export type EditCardValues = {
  /** Validated, trimmed title. */
  title: string;
  /** Validated description; empty string clears it (the schema allows `''`). */
  description: string;
  /** Due date at local midnight, or `null` when emptied. */
  dueAt: Date | null;
};

export type EditCardFormCard = {
  title: string;
  description: string | null;
  dueAt: Date | string | null;
};

type EditCardFormProps = {
  card: EditCardFormCard;
  /** Called with the changed fields when the form is submitted (no-op submit is a close). */
  onSubmit: (patch: Partial<EditCardValues>) => void;
  /** Called when there were no changes — the dialog can just close. */
  onNoChange?: () => void;
  /** Cancel / close action — wired to the dialog's close button by the wrapper. */
  onCancel?: () => void;
  /** Read-only mode (board `viewer`) — disables inputs, hides submit. */
  readOnly?: boolean;
  /** Mutation in flight — disables inputs and submit. */
  pending?: boolean;
  /** Server-side error message to surface inline. */
  error?: string | null;
};

/**
 * Card edit form: title (`Input`), description (`Textarea`), due date
 * (`<input type="date">`). Validates client-side against the shared schemas.
 * Submits only the fields that actually changed; if nothing changed, calls
 * `onNoChange`. In `readOnly` mode the inputs are disabled and there is no
 * submit (board `viewer`).
 */
export function EditCardForm({
  card,
  onSubmit,
  onNoChange,
  onCancel,
  readOnly = false,
  pending = false,
  error,
}: EditCardFormProps) {
  const titleId = useId();
  const descId = useId();
  const dueId = useId();
  const copy = strings.board.card;

  const initialDue = toDateInputValue(card.dueAt);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [due, setDue] = useState(initialDue);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

  // Re-sync if the underlying card changes (e.g. after a save / refetch).
  useEffect(() => setTitle(card.title), [card.title]);
  useEffect(() => setDescription(card.description ?? ''), [card.description]);
  useEffect(() => setDue(toDateInputValue(card.dueAt)), [card.dueAt]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;

    const parsedTitle = cardTitleSchema.safeParse(title);
    // The description schema is just `z.string().max(20_000)`, so the empty
    // string ("clear it") validates fine — no special-casing needed.
    const trimmedDescription = description.trim();
    const parsedDescription = cardDescriptionSchema.safeParse(trimmedDescription);

    setTitleError(
      parsedTitle.success ? null : (parsedTitle.error.issues[0]?.message ?? strings.common.unknownError),
    );
    setDescError(
      parsedDescription.success
        ? null
        : (parsedDescription.error.issues[0]?.message ?? strings.common.unknownError),
    );
    if (!parsedTitle.success || !parsedDescription.success) return;

    const nextTitle = parsedTitle.data;
    // Empty string clears the description on the server (the schema permits `''`).
    const nextDescription = parsedDescription.data;
    const nextDue = parseDateInputValue(due);

    const patch: Partial<EditCardValues> = {};
    if (nextTitle !== card.title) patch.title = nextTitle;
    if (nextDescription !== (card.description ?? '')) patch.description = nextDescription;
    if ((due || '') !== initialDue) patch.dueAt = nextDue;

    if (Object.keys(patch).length === 0) {
      onNoChange?.();
      return;
    }
    onSubmit(patch);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={titleId}>{copy.titleLabel}</Label>
        <Input
          id={titleId}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={copy.titlePlaceholder}
          disabled={readOnly || pending}
          autoComplete="off"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${titleId}-error` : undefined}
        />
        {titleError && (
          <p id={`${titleId}-error`} className="text-destructive text-sm">
            {titleError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={descId}>{copy.descriptionLabel}</Label>
        <Textarea
          id={descId}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={copy.descriptionPlaceholder}
          disabled={readOnly || pending}
          rows={4}
          aria-invalid={descError ? true : undefined}
          aria-describedby={descError ? `${descId}-error` : undefined}
        />
        {descError && (
          <p id={`${descId}-error`} className="text-destructive text-sm">
            {descError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={dueId}>{copy.dueAtLabel}</Label>
        <Input
          id={dueId}
          name="dueAt"
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          disabled={readOnly || pending}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {readOnly ? copy.close : strings.common.cancel}
          </Button>
        )}
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {pending ? copy.saving : copy.save}
          </Button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell — wires tRPC mutation + invalidation.
// ---------------------------------------------------------------------------

export type EditCardDialogCard = EditCardFormCard & { id: string };

type EditCardDialogProps = {
  boardId: string;
  card: EditCardDialogCard;
  /** Whether the viewer may edit (board `member+` and not archived). */
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * "Edit card" dialog. Controlled by the card item (which owns the trigger).
 * Wires `card.update` and, on success, invalidates `board.get`. In a read-only
 * context the form is shown disabled (board `viewer` / archived board).
 */
export function EditCardDialog({ boardId, card, canEdit, open, onOpenChange }: EditCardDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.card;

  const updateCard = useMutation(
    trpc.card.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        onOpenChange(false);
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (updateCard.isPending) return;
    if (!next) updateCard.reset();
    onOpenChange(next);
  };

  const handleSubmit = (patch: Partial<EditCardValues>) => {
    updateCard.mutate({ cardId: card.id, ...patch, clientMutationId: crypto.randomUUID() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{canEdit ? copy.editDialogTitle : copy.editDialogReadonlyTitle}</DialogTitle>
          <DialogDescription>{card.title}</DialogDescription>
        </DialogHeader>
        <EditCardForm
          card={card}
          readOnly={!canEdit}
          onSubmit={handleSubmit}
          onNoChange={() => handleOpenChange(false)}
          onCancel={() => handleOpenChange(false)}
          pending={updateCard.isPending}
          error={updateCard.isError ? updateCard.error.message || strings.common.unknownError : null}
        />
      </DialogContent>
    </Dialog>
  );
}
