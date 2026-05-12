'use client';

import { useEffect, useId, useState } from 'react';
import { cardDescriptionSchema } from '@pusula/domain';
import { Alert, AlertDescription, Button, Textarea } from '@pusula/ui';
import { strings } from '@/lib/strings';

type CardDetailDescriptionProps = {
  /** Persisted description (`null` ⇒ none). */
  description: string | null;
  /** Whether the viewer may edit (board `member+`, board/list/card active). */
  canEdit: boolean;
  /**
   * Called with the next description text — an empty string clears it on the
   * server (the schema permits `''`). Only invoked when it actually changed.
   */
  onSave: (description: string) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card description: plain text (no Markdown this phase). Shows the text (or an
 * "no description" placeholder) with an "edit" affordance for board `member+`;
 * on edit, a `Textarea` + save/cancel, validated against `cardDescriptionSchema`.
 * An emptied textarea clears the description; a no-op save just closes the editor.
 */
export function CardDetailDescription({
  description,
  canEdit,
  onSave,
  pending = false,
  error,
}: CardDetailDescriptionProps) {
  const fieldId = useId();
  const copy = strings.card.detail;
  const current = description ?? '';

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => setValue(current), [current]);

  const start = () => {
    setValue(current);
    setValueError(null);
    setEditing(true);
  };
  const cancel = () => {
    setValue(current);
    setValueError(null);
    setEditing(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    const parsed = cardDescriptionSchema.safeParse(trimmed);
    if (!parsed.success) {
      setValueError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setValueError(null);
    if (parsed.data === current) {
      setEditing(false);
      return;
    }
    onSave(parsed.data);
    setEditing(false);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.descriptionTitle}</h3>
        {canEdit && !editing && (
          <Button type="button" variant="ghost" size="sm" onClick={start}>
            {current ? copy.descriptionEdit : copy.descriptionAdd}
          </Button>
        )}
      </div>

      {editing && canEdit ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-2">
          <Textarea
            id={fieldId}
            name="cardDescription"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={copy.descriptionPlaceholder}
            aria-label={copy.descriptionTitle}
            disabled={pending}
            rows={4}
            aria-invalid={valueError ? true : undefined}
            aria-describedby={valueError ? `${fieldId}-error` : undefined}
          />
          {valueError && (
            <p id={`${fieldId}-error`} className="text-destructive text-sm">
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
              {pending ? copy.descriptionSaving : copy.descriptionSave}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
              {copy.descriptionCancel}
            </Button>
          </div>
        </form>
      ) : current ? (
        <p className="text-sm break-words whitespace-pre-wrap">{current}</p>
      ) : (
        <p className="text-muted-foreground text-sm">{copy.descriptionEmpty}</p>
      )}
    </section>
  );
}
