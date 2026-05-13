'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { boardTitleSchema } from '@pusula/domain';
import { Button, Input, cn, toast } from '@pusula/ui';
import {
  applyBoardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type RenameBoardFormProps = {
  boardId: string;
  /** Current persisted board title — pre-fills the input. */
  title: string;
  /**
   * Optionally control the editing state from the outside (e.g. a "rename" menu
   * item in the board top bar). When omitted, the form is uncontrolled and shows
   * its own "edit" affordance.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Hide the built-in "edit" affordance when collapsed (for fully external triggers). */
  hideTrigger?: boolean;
};

/**
 * Inline board rename: shows the title as static text with an "edit" affordance;
 * on edit, an input + save/cancel. Save calls `board.update` and, on success,
 * invalidates `board.get` so the new title propagates. Only mounted by the page
 * when the viewer is a board `admin`. The editing state can be lifted via
 * `editing` / `onEditingChange` (e.g. driven by a top-bar menu).
 */
export function RenameBoardForm({
  boardId,
  title,
  editing: editingProp,
  onEditingChange,
  hideTrigger = false,
}: RenameBoardFormProps) {
  const trpc = useTRPC();
  const inputId = useId();
  const copy = strings.board.detail;

  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };
  const [value, setValue] = useState(title);
  const [valueError, setValueError] = useState<string | null>(null);
  const skipCommitRef = useRef(false);

  // Re-sync when the persisted title changes (e.g. after a save by another tab).
  useEffect(() => setValue(title), [title]);

  const renameBoard = useOptimisticBoardMutation({
    mutationOptions: trpc.board.update.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.title == null ? data : applyBoardPatch(data, { title: vars.title }),
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
    onMutationSuccess: () => setEditing(false),
  });

  const startEditing = () => {
    skipCommitRef.current = false;
    setValue(title);
    setValueError(null);
    renameBoard.reset();
    setEditing(true);
  };

  const cancel = () => {
    skipCommitRef.current = true;
    setValue(title);
    setValueError(null);
    renameBoard.reset();
    setEditing(false);
  };

  const commit = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    if (renameBoard.isPending) return;
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
    renameBoard.mutate({ boardId, title: parsed.data });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit();
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="min-w-0 truncate text-[15px] font-semibold">
          <button
            type="button"
            className="min-w-0 max-w-full truncate rounded-sm text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={startEditing}
          >
            {title}
          </button>
        </h1>
        {!hideTrigger && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={copy.rename}
            onClick={startEditing}
          >
            <PencilIcon className="size-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-1">
      <Input
        id={inputId}
        name="boardTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        placeholder={copy.renamePlaceholder}
        aria-label={copy.renamePlaceholder}
        disabled={renameBoard.isPending}
        autoComplete="off"
        autoFocus
        className={cn(
          'h-7 max-w-xs border-0 bg-muted/40 px-1.5 text-[15px] font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-ring/50',
          valueError && 'ring-2 ring-destructive/40',
        )}
        aria-invalid={valueError || renameBoard.isError ? true : undefined}
        aria-describedby={valueError ? `${inputId}-error` : undefined}
      />
      {valueError && (
        <p id={`${inputId}-error`} className="text-destructive w-full text-sm">
          {valueError}
        </p>
      )}
      {!valueError && renameBoard.isError && (
        <p className="text-destructive w-full text-sm">
          {getMutationErrorMessage(renameBoard) ?? strings.common.unknownError}
        </p>
      )}
    </form>
  );
}
