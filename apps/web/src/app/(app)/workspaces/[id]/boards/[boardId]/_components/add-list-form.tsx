'use client';

import { useId, useState } from 'react';
import { listTitleSchema } from '@pusula/domain';
import { Button, Input } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type AddListFormProps = {
  /** Called with the validated, trimmed title when the form is submitted. */
  onSubmit: (title: string) => void;
  /** Mutation in flight — disables the input and submit button. */
  pending?: boolean;
  /** Server-side error message to surface inline. */
  error?: string | null;
};

/**
 * Presentational "add a list" form: a single title input + submit. Validates
 * client-side against the shared `listTitleSchema` (so the rule matches the
 * server). No tRPC dependency — the column container wires the mutation.
 */
export function AddListForm({ onSubmit, pending = false, error }: AddListFormProps) {
  const inputId = useId();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const copy = strings.board.column;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = listTitleSchema.safeParse(title);
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
      <Input
        id={inputId}
        name="listTitle"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={copy.addListPlaceholder}
        aria-label={copy.addListPlaceholder}
        disabled={pending}
        autoComplete="off"
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
        {pending ? copy.addListSubmitting : copy.addListSubmit}
      </Button>
    </form>
  );
}
