'use client';

import { useEffect, useState } from 'react';
import { AlignLeftIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  RichTextContent,
  RichTextEditor,
  SectionHeader,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { isSameRichText } from './rich-text-helpers';

type CardDetailDescriptionProps = {
  /** Persisted description — Tiptap JSON string or legacy plain text (`null` ⇒ none). */
  description: string | null;
  /** Whether the viewer may edit (board `member+`, board/list/card active). */
  canEdit: boolean;
  /**
   * Called with the next description string — the Tiptap JSON serialisation, or
   * an empty string when the editor is empty (so the "no description" placeholder
   * still works and the board card chip stays clean). Only invoked when changed.
   */
  onSave: (description: string) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card description: rich text (Tiptap). Read mode renders the stored content via
 * the controlled read-only renderer (or a muted "add description" prompt when
 * empty); edit mode shows the full toolbar editor + save/cancel. Storage is the
 * Tiptap JSON string; legacy plain-text rows are parsed into a paragraph at
 * render time (no migration). A no-op save just closes the editor.
 */
export function CardDetailDescription({
  description,
  canEdit,
  onSave,
  pending = false,
  error,
}: CardDetailDescriptionProps) {
  const copy = strings.card.detail;
  const current = description ?? '';

  const [editing, setEditing] = useState(false);
  // The editor's live value (the serialised JSON string) + whether it's empty.
  const [draft, setDraft] = useState<string>(current);
  const [draftEmpty, setDraftEmpty] = useState(current.trim().length === 0);

  useEffect(() => {
    if (!editing) {
      setDraft(current);
      setDraftEmpty(current.trim().length === 0);
    }
  }, [current, editing]);

  const start = () => {
    setDraft(current);
    setDraftEmpty(current.trim().length === 0);
    setEditing(true);
  };
  const cancel = () => {
    setDraft(current);
    setDraftEmpty(current.trim().length === 0);
    setEditing(false);
  };

  const save = () => {
    const next = draftEmpty ? '' : draft;
    // No-op when the document is semantically unchanged — including the case
    // where `current` is legacy plain text and `next` is its Tiptap JSON form.
    if (isSameRichText(next, current)) {
      setEditing(false);
      return;
    }
    onSave(next);
    setEditing(false);
  };

  const hasContent = current.trim().length > 0;

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<AlignLeftIcon className="size-3.5" aria-hidden />}
        action={
          canEdit && !editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={start}>
              {hasContent ? copy.descriptionEditAction : copy.descriptionAdd}
            </Button>
          ) : null
        }
      >
        {copy.descriptionTitle}
      </SectionHeader>

      {editing && canEdit ? (
        <div className="space-y-2">
          <RichTextEditor
            value={current}
            placeholder={copy.descriptionPlaceholder}
            ariaLabel={copy.descriptionTitle}
            labels={copy.richText}
            disabled={pending}
            onChange={(serialized, isEmpty) => {
              setDraft(serialized);
              setDraftEmpty(isEmpty);
            }}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? copy.descriptionSaving : copy.descriptionSave}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
              {copy.descriptionCancelAction}
            </Button>
          </div>
        </div>
      ) : hasContent ? (
        <RichTextContent value={current} />
      ) : canEdit ? (
        <button
          type="button"
          onClick={start}
          className="block w-full rounded-md bg-muted/40 p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          {copy.descriptionEmptyPrompt}
        </button>
      ) : (
        <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
          {copy.descriptionEmpty}
        </p>
      )}
    </section>
  );
}
