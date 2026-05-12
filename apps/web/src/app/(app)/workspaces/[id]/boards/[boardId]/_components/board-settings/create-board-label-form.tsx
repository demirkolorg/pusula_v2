'use client';

import { useId, useState } from 'react';
import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_SWATCH } from '../label-colors';

type CreateBoardLabelFormProps = {
  /** Called with the chosen colour (+ optional trimmed name) to create a board label. */
  onSubmit: (input: { color: LabelColor; name?: string }) => void;
  /** Mutation in flight — disables the controls. */
  pending?: boolean;
  /** Server-side error to surface inline (e.g. CONFLICT — same colour+name). */
  error?: string | null;
};

/**
 * Presentational "new board label" form: a colour picker (the fixed
 * `@pusula/domain` `LABEL_COLORS` palette) + an optional name field + submit.
 * Resets the name after a submit. No tRPC dependency — the section container
 * wires the mutation.
 */
export function CreateBoardLabelForm({ onSubmit, pending = false, error }: CreateBoardLabelFormProps) {
  const nameId = useId();
  const copy = strings.board.settings;
  const [color, setColor] = useState<LabelColor>(LABEL_COLORS[0]);
  const [name, setName] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    onSubmit(trimmed ? { color, name: trimmed } : { color });
    setName('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-medium">{copy.labelAdd}</p>
      <div>
        <span className="text-muted-foreground mb-1 block text-xs">{copy.labelColorLabel}</span>
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`${copy.labelColorOf} ${c}`}
              aria-pressed={color === c}
              disabled={pending}
              className={cn(
                'size-5 rounded-full ring-offset-1 outline-none disabled:opacity-50',
                'focus-visible:ring-ring/60 focus-visible:ring-2',
                LABEL_SWATCH[c],
                color === c && 'ring-foreground ring-2',
              )}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={nameId} className="text-muted-foreground block text-xs">
          {copy.labelNameLabel}
        </label>
        <Input
          id={nameId}
          name="labelName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={copy.labelNamePlaceholder}
          disabled={pending}
          autoComplete="off"
          maxLength={50}
          className="max-w-xs"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? copy.labelAdding : copy.labelAdd}
      </Button>
    </form>
  );
}
