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

/**
 * "+ Liste ekle" trigger — `SectionHeader` action slotunda durur. Tıklayınca
 * gerçek form (`AddChecklistFormPanel`) section gövdesinde tam genişlikte
 * açılır; state parent'ta (`CardDetailChecklists`) tutulur ki dar action
 * slotunda input sıkışmasın.
 */
export function AddChecklistTrigger({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const copy = strings.card.checklist;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={copy.addAction}
        >
          <PlusIcon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copy.addAction}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Yeni checklist ekleme formu — tam genişlikte, `ChecklistBlock`'larla aynı
 * `border rounded-md` shell'i (UI tutarlılığı). Submit/Cancel sonrası
 * `onClose` ile parent state'i kapatır.
 */
export function AddChecklistFormPanel({
  onSubmit,
  onClose,
  pending,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const copy = strings.card.checklist;
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

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
        onClose();
      }}
      noValidate
      className="space-y-2 rounded-md border bg-card p-3"
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
        autoFocus
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
            setValue('');
            setError(null);
            onClose();
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
