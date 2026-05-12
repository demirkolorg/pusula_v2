'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardTitleSchema } from '@pusula/domain';
import { Button, Input } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type RenameBoardFormProps = {
  boardId: string;
  /** Current persisted board title — pre-fills the input. */
  title: string;
};

/**
 * Inline board rename: shows the title as static text with an "edit" affordance;
 * on edit, an input + save/cancel. Save calls `board.update` and, on success,
 * invalidates `board.get` so the new title propagates. Only mounted by the page
 * when the viewer is a board `admin`.
 */
export function RenameBoardForm({ boardId, title }: RenameBoardFormProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const inputId = useId();
  const copy = strings.board.detail;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [valueError, setValueError] = useState<string | null>(null);

  // Re-sync when the persisted title changes (e.g. after a save by another tab).
  useEffect(() => setValue(title), [title]);

  const renameBoard = useMutation(
    trpc.board.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        setEditing(false);
      },
    }),
  );

  const startEditing = () => {
    setValue(title);
    setValueError(null);
    renameBoard.reset();
    setEditing(true);
  };

  const cancel = () => {
    setValue(title);
    setValueError(null);
    renameBoard.reset();
    setEditing(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = boardTitleSchema.safeParse(value);
    if (!parsed.success) {
      setValueError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setValueError(null);
    if (parsed.data === title) {
      setEditing(false);
      return;
    }
    renameBoard.mutate({ boardId, title: parsed.data, clientMutationId: crypto.randomUUID() });
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
          {copy.rename}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-center gap-2">
      <Input
        id={inputId}
        name="boardTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.renamePlaceholder}
        aria-label={copy.renamePlaceholder}
        disabled={renameBoard.isPending}
        autoComplete="off"
        className="max-w-xs"
        aria-invalid={valueError || renameBoard.isError ? true : undefined}
        aria-describedby={valueError ? `${inputId}-error` : undefined}
      />
      <Button type="submit" size="sm" disabled={renameBoard.isPending}>
        {renameBoard.isPending ? copy.renameSaving : copy.renameSave}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={cancel}
        disabled={renameBoard.isPending}
      >
        {copy.renameCancel}
      </Button>
      {valueError && (
        <p id={`${inputId}-error`} className="text-destructive w-full text-sm">
          {valueError}
        </p>
      )}
      {!valueError && renameBoard.isError && (
        <p className="text-destructive w-full text-sm">
          {renameBoard.error.message || strings.common.unknownError}
        </p>
      )}
    </form>
  );
}
