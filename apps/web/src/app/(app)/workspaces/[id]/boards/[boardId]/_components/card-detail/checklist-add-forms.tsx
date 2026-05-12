'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { checklistItemContentSchema, checklistTitleSchema } from '@pusula/domain';
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger } from '@pusula/ui';
import { strings } from '@/lib/strings';

// ---------------------------------------------------------------------------
// Inline "add" forms — tiny, self-contained. Collapsed to an icon-only button
// until opened; validate against the domain schema and reset on submit/cancel.
// ---------------------------------------------------------------------------

export function AddChecklistForm({
  onSubmit,
  pending,
}: {
  onSubmit: (title: string) => void;
  pending: boolean;
}) {
  const copy = strings.card.checklist;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label={copy.addAction}
          >
            <PlusIcon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copy.addAction}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = checklistTitleSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
          return;
        }
        setError(null);
        onSubmit(parsed.data);
        setValue('');
        setOpen(false);
      }}
      noValidate
      className="space-y-2"
    >
      <Input
        name="checklistTitle"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.addTitlePlaceholder}
        aria-label={copy.addTitlePlaceholder}
        disabled={pending}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? copy.adding : copy.addSubmit}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setValue('');
            setError(null);
          }}
        >
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}

export function AddItemForm({
  onSubmit,
  pending,
}: {
  onSubmit: (content: string) => void;
  pending: boolean;
}) {
  const copy = strings.card.checklist;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground -ml-1.5 h-7 gap-1.5 px-2"
      >
        <PlusIcon className="size-3.5" aria-hidden />
        {copy.itemAddAction}
      </Button>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = checklistItemContentSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
          return;
        }
        setError(null);
        onSubmit(parsed.data);
        setValue('');
        setOpen(false);
      }}
      noValidate
      className="space-y-2"
    >
      <Input
        name="checklistItemContent"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.itemPlaceholder}
        aria-label={copy.itemPlaceholder}
        disabled={pending}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? copy.itemAdding : copy.itemAddSubmit}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setValue('');
            setError(null);
          }}
        >
          {copy.itemCancel}
        </Button>
      </div>
    </form>
  );
}
