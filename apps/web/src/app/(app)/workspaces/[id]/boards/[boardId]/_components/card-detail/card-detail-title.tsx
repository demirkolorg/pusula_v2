'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { cardTitleSchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

type CardDetailTitleProps = {
  title: string;
  /** Whether the card is marked complete (renders the heading struck through). */
  completed?: boolean;
  /** Whether the viewer may rename the card (board `member+`, board/list/card active). */
  canEdit: boolean;
  /** Called with the validated, trimmed title; only invoked when it actually changed. */
  onSave: (title: string) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card title in the modal's sticky header: a large heading that becomes an
 * auto-sizing `textarea` on click (board `member+`), validated client-side
 * against `cardTitleSchema`. The read heading and the editor share the same
 * `py-1`/`text-lg`/`leading-tight` metrics so toggling doesn't shift the layout;
 * the editor uses an `aria-label` instead of a placeholder (no placeholder
 * bleeding). A no-op save just closes the editor; read-only viewers see the
 * heading only. A completed card shows the heading struck through and muted.
 */
export function CardDetailTitle({
  title,
  completed = false,
  canEdit,
  onSave,
  pending = false,
  error,
}: CardDetailTitleProps) {
  const inputId = useId();
  const copy = strings.card.detail;
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  const start = () => {
    setValue(title);
    setValueError(null);
    setEditing(true);
  };
  const cancel = () => {
    setValue(title);
    setValueError(null);
    setEditing(false);
  };

  const submit = () => {
    const parsed = cardTitleSchema.safeParse(value);
    if (!parsed.success) {
      setValueError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setValueError(null);
    if (parsed.data === title) {
      setEditing(false);
      return;
    }
    onSave(parsed.data);
    setEditing(false);
  };

  if (!editing || !canEdit) {
    return (
      <div className="flex items-start gap-1.5">
        <h2
          className={cn(
            'flex-1 px-2 py-1 text-lg leading-tight font-semibold break-words',
            completed && 'text-muted-foreground line-through',
          )}
        >
          {title}
        </h2>
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={start}
                aria-label={copy.editTitle}
                className="mt-0.5 shrink-0"
              >
                <PencilIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.editTitle}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
      className="space-y-2"
    >
      <textarea
        ref={taRef}
        id={inputId}
        name="cardTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        rows={1}
        aria-label={copy.titleLabel}
        disabled={pending}
        autoComplete="off"
        aria-invalid={valueError ? true : undefined}
        aria-describedby={valueError ? `${inputId}-error` : undefined}
        className={cn(
          'w-full resize-none rounded-md border bg-card px-2 py-1 text-lg leading-tight font-semibold field-sizing-content focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
          completed && 'text-muted-foreground line-through',
          valueError && 'border-destructive',
        )}
      />
      {valueError && (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {valueError}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? copy.titleSaving : copy.titleSave}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
          {copy.titleCancel}
        </Button>
      </div>
    </form>
  );
}
