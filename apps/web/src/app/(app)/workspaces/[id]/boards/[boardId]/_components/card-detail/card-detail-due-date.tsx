'use client';

import { useEffect, useId, useState } from 'react';
import { Alert, AlertDescription, Badge, Button, DatePickerInput } from '@pusula/ui';
import { formatDate, parseDateInputValue, toDateInputValue } from '@/lib/format';
import { strings } from '@/lib/strings';

type CardDetailDueDateProps = {
  /** Persisted due date (`null` ⇒ none). */
  dueAt: Date | string | null;
  /** Whether the viewer may edit (board `member+`, board/list/card active). */
  canEdit: boolean;
  /** Called with the new due date (`null` clears it). Only invoked on a real change. */
  onSave: (dueAt: Date | null) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card due date: shows the formatted date (or a placeholder) with edit / clear
 * affordances for board `member+`. The editor keeps the same TZ-safe
 * `yyyy-mm-dd` value contract while allowing both manual typing and calendar
 * selection. A no-op save just closes the editor.
 */
export function CardDetailDueDate({ dueAt, canEdit, onSave, pending = false, error }: CardDetailDueDateProps) {
  const fieldId = useId();
  const copy = strings.card.detail;
  const currentInput = toDateInputValue(dueAt);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentInput);

  useEffect(() => setValue(currentInput), [currentInput]);

  const start = () => {
    setValue(currentInput);
    setEditing(true);
  };
  const cancel = () => {
    setValue(currentInput);
    setEditing(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((value || '') === currentInput) {
      setEditing(false);
      return;
    }
    onSave(parseDateInputValue(value));
    setEditing(false);
  };

  const clear = () => {
    onSave(null);
    setEditing(false);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.dueTitle}</h3>
        {canEdit && !editing && (
          <Button type="button" variant="ghost" size="sm" onClick={start}>
            {dueAt != null ? copy.dueEdit : copy.dueAdd}
          </Button>
        )}
      </div>

      {editing && canEdit ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-2">
          <DatePickerInput
            id={fieldId}
            name="cardDueAt"
            value={value}
            onValueChange={setValue}
            aria-label={copy.dueLabel}
            placeholder={copy.duePlaceholder}
            calendarButtonLabel={copy.dueCalendarSelect}
            disabled={pending}
            className="max-w-xs"
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? copy.dueSaving : copy.dueSave}
            </Button>
            {dueAt != null && (
              <Button type="button" variant="outline" size="sm" onClick={clear} disabled={pending}>
                {copy.dueClear}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>
              {strings.common.cancel}
            </Button>
          </div>
        </form>
      ) : dueAt != null ? (
        <Badge variant="outline">{formatDate(dueAt)}</Badge>
      ) : (
        <p className="text-muted-foreground text-sm">{copy.dueEmpty}</p>
      )}
    </section>
  );
}
