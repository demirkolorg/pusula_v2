'use client';

import { useId, useState } from 'react';
import { cardTitleSchema } from '@pusula/domain';
import { Button, Textarea } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type AddCardFormProps = {
  /** Called with the validated, trimmed title when the form is submitted. */
  onSubmit: (title: string) => void;
  /** Mutation in flight — disables the input and submit button. */
  pending?: boolean;
  /** Server-side error message to surface inline. */
  error?: string | null;
};

/**
 * Presentational "add a card" form: a small textarea for the title + submit.
 * Validates client-side against the shared `cardTitleSchema`. No tRPC dependency
 * — the column container wires the mutation. After a successful submit the field
 * is cleared so a quick succession of cards can be added.
 */
export function AddCardForm({ onSubmit, pending = false, error }: AddCardFormProps) {
  const inputId = useId();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const copy = strings.board.card;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = cardTitleSchema.safeParse(title);
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setTitleError(null);
    onSubmit(parsed.data);
    setTitle('');
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <Textarea
        id={inputId}
        name="cardTitle"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={copy.addCardPlaceholder}
        aria-label={copy.addCardPlaceholder}
        disabled={pending}
        rows={2}
        aria-invalid={titleError ? true : undefined}
        aria-describedby={titleError ? `${inputId}-error` : undefined}
      />
      {titleError && (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {titleError}
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? copy.addCardSubmitting : copy.addCardSubmit}
      </Button>
    </form>
  );
}
