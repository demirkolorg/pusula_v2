'use client';

import { useEffect, useId, useState } from 'react';
import { cardTitleSchema } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input } from '@pusula/ui';
import { strings } from '@/lib/strings';

type CardDetailTitleProps = {
  title: string;
  /** Whether the viewer may rename the card (board `member+`, board/list/card active). */
  canEdit: boolean;
  /** Called with the validated, trimmed title; only invoked when it actually changed. */
  onSave: (title: string) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card title: a heading with an "edit" affordance (board `member+`); on edit, an
 * input + save/cancel, validated client-side against `cardTitleSchema`. A no-op
 * save just closes the editor. Read-only viewers see the heading only.
 */
export function CardDetailTitle({ title, canEdit, onSave, pending = false, error }: CardDetailTitleProps) {
  const inputId = useId();
  const copy = strings.card.detail;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => setValue(title), [title]);

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-lg font-semibold tracking-tight break-words">{title}</h2>
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={start}>
            {copy.editTitle}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <Input
        id={inputId}
        name="cardTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={copy.titleLabel}
        disabled={pending}
        autoComplete="off"
        aria-invalid={valueError ? true : undefined}
        aria-describedby={valueError ? `${inputId}-error` : undefined}
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
