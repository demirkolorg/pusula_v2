'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cardTitleSchema } from '@pusula/domain';
import { Alert, AlertDescription, cn } from '@pusula/ui';
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
  focusEditToken?: number;
};

/**
 * Card title in the modal's sticky header: v1-style, always-visible autosizing
 * textarea for editors, validated client-side against `cardTitleSchema`.
 * Read-only viewers see the heading only. A completed card shows the heading
 * struck through and muted.
 */
export function CardDetailTitle({
  title,
  completed = false,
  canEdit,
  onSave,
  pending = false,
  error,
  focusEditToken = 0,
}: CardDetailTitleProps) {
  const inputId = useId();
  const copy = strings.card.detail;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(title);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (!canEdit || focusEditToken <= 0) return;
    taRef.current?.focus();
    taRef.current?.select();
  }, [canEdit, focusEditToken]);

  const submit = () => {
    const parsed = cardTitleSchema.safeParse(value);
    if (!parsed.success) {
      setValueError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setValueError(null);
    if (parsed.data === title) return;
    onSave(parsed.data);
  };

  if (!canEdit) {
    return (
      <h2
        className={cn(
          'flex-1 px-1 py-0.5 text-[20px] leading-tight font-semibold break-words sm:text-[22px]',
          completed && 'text-muted-foreground line-through',
        )}
      >
        {title}
      </h2>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={taRef}
        id={inputId}
        name="cardTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => submit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setValue(title);
            setValueError(null);
            event.currentTarget.blur();
          }
        }}
        rows={1}
        aria-label={copy.titleLabel}
        disabled={pending}
        autoComplete="off"
        aria-invalid={valueError ? true : undefined}
        aria-describedby={valueError ? `${inputId}-error` : undefined}
        className={cn(
          'w-full resize-none rounded-md border-0 bg-transparent px-1 py-0.5 text-[20px] leading-tight font-semibold outline-none transition-colors field-sizing-content sm:text-[22px]',
          'hover:bg-muted/50 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40',
          completed && 'text-muted-foreground line-through',
          valueError && 'ring-2 ring-destructive/40',
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
    </div>
  );
}
