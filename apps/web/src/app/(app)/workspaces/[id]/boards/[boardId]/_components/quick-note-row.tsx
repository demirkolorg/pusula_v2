'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { GripVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { quickNoteContentSchema } from '@pusula/domain';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { isPendingQuickNoteId, type QuickNote } from '@/lib/use-quick-note-mutations';

type QuickNoteRowProps = {
  note: QuickNote;
  /**
   * Whether the note may be dragged onto a list to become a card — board
   * `member+` on an active board. CRUD (edit/delete) is always allowed (a quick
   * note is personal); only the convert-by-drag affordance is gated.
   */
  canConvert: boolean;
  /** Edit saved — called with the trimmed, non-empty body when it actually changed. */
  onUpdate: (content: string) => void;
  /** Delete confirmed. */
  onDelete: () => void;
};

/**
 * One row in the web "Hızlı Notlar" panel (DEM-205) — the note body plus
 * edit / delete actions. The whole row is a Pragmatic DnD `draggable`: dragging
 * it onto a board list converts it to a card (`board`'s global
 * `monitorForElements` handles the drop). Editing is inline; deleting goes
 * through a confirm dialog (mobile parity).
 *
 * A `tmp-` id'd note hasn't been written to the server yet — it is not
 * draggable and its actions are disabled until the real row arrives.
 */
export function QuickNoteRow({ note, canConvert, onUpdate, onDelete }: QuickNoteRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pending = isPendingQuickNoteId(note.id);
  const draggableEnabled = canConvert && !pending && !editing;
  const copy = strings.board.quickNotes;

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !draggableEnabled) return;
    return draggable({
      element,
      getInitialData: () => ({ type: 'quick-note', noteId: note.id, content: note.content }),
      onGenerateDragPreview: ({ nativeSetDragImage, location, source }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: preserveOffsetOnSource({
            element: source.element,
            input: location.current.input,
          }),
          render: ({ container }) => {
            const rect = source.element.getBoundingClientRect();
            const clone = source.element.cloneNode(true) as HTMLElement;
            clone.style.width = `${rect.width}px`;
            clone.style.opacity = '1';
            clone.removeAttribute('data-dragging');
            container.appendChild(clone);
            return () => clone.remove();
          },
        });
      },
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [draggableEnabled, note.id, note.content]);

  if (editing) {
    return (
      <QuickNoteEditForm
        initialValue={note.content}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          setEditing(false);
          if (next !== note.content) onUpdate(next);
        }}
      />
    );
  }

  return (
    <div
      ref={rowRef}
      data-quick-note-id={note.id}
      data-dragging={dragging ? 'true' : undefined}
      aria-label={draggableEnabled ? copy.dragLabel(note.content) : undefined}
      className={cn(
        'group border-border bg-card rounded-lg border p-3 shadow-sm',
        draggableEnabled && 'cursor-grab',
        dragging && 'opacity-50',
        pending && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        {draggableEnabled && (
          <GripVerticalIcon
            aria-hidden
            className="text-muted-foreground/60 mt-0.5 size-4 shrink-0"
          />
        )}
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{note.content}</p>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {draggableEnabled && (
          <span className="text-muted-foreground mr-auto text-xs">{copy.dragHint}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={pending}
          aria-label={copy.editAction}
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <ConfirmDeleteDialog
          onConfirm={onDelete}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive size-7"
              disabled={pending}
              aria-label={copy.deleteAction}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** Inline edit form — a textarea seeded with the note body + save / cancel. */
function QuickNoteEditForm({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const copy = strings.board.quickNotes;

  const submit = () => {
    const parsed = quickNoteContentSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    onSave(parsed.data);
  };

  return (
    <form
      className="border-border bg-card space-y-2 rounded-lg border p-3 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      <Textarea
        id={inputId}
        autoFocus
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') onCancel();
        }}
        placeholder={copy.editPlaceholder}
        aria-label={copy.editPlaceholder}
        aria-invalid={error ? true : undefined}
        className="text-sm"
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-1">
        <Button type="submit" size="sm">
          {copy.editSubmit}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {strings.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Minimal destructive-action confirm dialog for deleting a quick note. */
function ConfirmDeleteDialog({
  trigger,
  onConfirm,
}: {
  trigger: React.ReactNode;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const copy = strings.board.quickNotes;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.deleteConfirmTitle}</DialogTitle>
          <DialogDescription>{copy.deleteConfirmBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {copy.deleteConfirmAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
