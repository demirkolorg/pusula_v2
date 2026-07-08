'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { checklistTitleSchema } from '@pusula/domain';
import { Button, Input, RichTextEditor, Tooltip, TooltipContent, TooltipTrigger } from '@pusula/ui';
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
  startOpen = false,
  onClose,
  placeholder,
}: {
  onSubmit: (content: string) => void;
  pending: boolean;
  /**
   * İç içe (nested) alt madde modu: form açık başlar, tetikleyici buton
   * gösterilmez; ekleme/vazgeç sonrası `onClose` çağrılır (üst bileşen formu
   * söker). Varsayılan (`false`) kök madde davranışı: buton → form, ekleme
   * sonrası form kapanır ve buton geri gelir.
   */
  startOpen?: boolean;
  /** `startOpen` modunda ekleme/vazgeç sonrası — üst bileşen formu kapatır. */
  onClose?: () => void;
  /** Editör placeholder'ı (alt madde için farklı metin); yoksa kök madde metni. */
  placeholder?: string;
}) {
  const copy = strings.card.checklist;
  // Madde metni artık zengin (Tiptap) — yorum composer'ıyla aynı editör. `value`
  // Tiptap JSON string (boşken `null`); `empty` boş-doc submit'ini engeller;
  // `resetSeq` bump'ı editörü remount ederek temizler (composer deseni).
  const richTextLabels = strings.card.detail.richText;
  const [open, setOpen] = useState(startOpen);
  const [value, setValue] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [resetSeq, setResetSeq] = useState(0);
  const fieldPlaceholder = placeholder ?? copy.itemPlaceholder;

  const reset = () => {
    setValue(null);
    setEmpty(true);
    setResetSeq((n) => n + 1);
  };
  const submit = () => {
    if (empty || value == null) return;
    onSubmit(value);
    reset();
    // Alt madde: tek seferlik, üst bileşen formu kapatır. Kök madde: form kapanır,
    // buton geri gelir (art arda madde girişi mümkün).
    if (startOpen) onClose?.();
    else setOpen(false);
  };
  const cancel = () => {
    reset();
    if (startOpen) onClose?.();
    else setOpen(false);
  };

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
    <div className="space-y-2">
      {/* Enter = yeni satır (Tiptap); kaydet = Cmd/Ctrl+Enter veya "Ekle". */}
      <div
        onKeyDownCapture={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <RichTextEditor
          key={resetSeq}
          value={value}
          placeholder={fieldPlaceholder}
          labels={richTextLabels}
          toolbar="mini"
          collapsibleToolbar
          ariaLabel={fieldPlaceholder}
          disabled={pending}
          onChange={(serialized, isEmpty) => {
            setValue(isEmpty ? null : serialized);
            setEmpty(isEmpty);
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending || empty} onClick={submit}>
          {pending ? copy.itemAdding : copy.itemAddSubmit}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={cancel}
        >
          {copy.itemCancel}
        </Button>
      </div>
    </div>
  );
}
