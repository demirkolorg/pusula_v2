'use client';

import { useEffect, useState } from 'react';
import {
  AlignLeftIcon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  RichTextContent,
  RichTextEditor,
  SectionHeader,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  renderRichTextToHTML,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { asciiSlug } from '@/lib/pdf/filename';
import { isSameRichText } from './rich-text-helpers';

type CardDetailDescriptionProps = {
  /** Persisted description — Tiptap JSON string or legacy plain text (`null` ⇒ none). */
  description: string | null;
  /** Card title — used as the base for the `.docx` download filename. */
  cardTitle?: string;
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

/** Panel-card'ın sabit üst kabuğu — scroll'un dışında (FE-2026-05-31-002, revize 2026-05-31). */
const HEADER_CLASS =
  'mb-0 shrink-0 border-b bg-muted/50 px-4 py-2.5';

/**
 * Card description: rich text (Tiptap). Read mode renders the stored content via
 * the controlled read-only renderer (or a muted "add description" prompt when
 * empty); edit mode shows the full toolbar editor + save/cancel. Storage is the
 * Tiptap JSON string; legacy plain-text rows are parsed into a paragraph at
 * render time (no migration). A no-op save just closes the editor.
 *
 * FE-2026-05-31-002 — Aksiyon slot'una "Kopyala" + "Word olarak indir" eklendi:
 * Tiptap JSON → `renderRichTextToHTML()` ile aynı extension set'i (mention chip
 * + link sanitization) üzerinden HTML üretilir; kopya `navigator.clipboard.write`
 * dual-format (text/html + text/plain) ile, indirme `html-docx-js-typescript`
 * (dynamic import — lazy-load) ile `.docx` üretir.
 */
export function CardDetailDescription({
  description,
  cardTitle,
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
  const [downloadPending, setDownloadPending] = useState(false);

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

  const handleCopy = async () => {
    try {
      const html = renderRichTextToHTML(current);
      // Plain-text fallback: strip tags via a detached element (no document
      // append, no XSS — innerHTML on a non-rendered element is safe for
      // extraction). Used both as the `text/plain` clipboard variant and the
      // single-format fallback for browsers without ClipboardItem.
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const plain = tmp.textContent ?? '';

      if (typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast.success(copy.descriptionCopySuccess);
    } catch {
      toast.error(copy.descriptionCopyError);
    }
  };

  const handleDownload = async () => {
    setDownloadPending(true);
    try {
      const body = renderRichTextToHTML(current);
      // Word/Pages doğru render etsin diye minimal HTML kabuğu — UTF-8 meta
      // başlık zorunlu (Türkçe karakterler için), Roboto/Inter zorunluluğu yok
      // (Word default font'u kullanır).
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
        cardTitle ?? copy.descriptionTitle,
      )}</title></head><body>${body}</body></html>`;

      // Dynamic import — html-docx-js-typescript ~80KB gz; yalnız indir
      // tıklandığında bundle'a girer. asBlob `Blob | Buffer` döner — tarayıcıda
      // runtime'da daima `Blob`; Node yolu hiç çalışmaz. TS union'unu cast ile
      // narrow ediyoruz.
      const { asBlob } = await import('html-docx-js-typescript');
      const result = (await asBlob(fullHtml)) as Blob | BlobPart;
      const blob = result instanceof Blob ? result : new Blob([result]);

      const baseName = asciiSlug(cardTitle ?? '') || copy.descriptionDownloadFallbackName;
      const filename = `${baseName}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(copy.descriptionDownloadError);
    } finally {
      setDownloadPending(false);
    }
  };

  // Aksiyon slot'u: read mode'da kopyala + indir + düzenle; edit mode'da yalnız
  // vazgeç (içeride zaten gösterilen save/cancel butonları ile aynı yere
  // koymamak için header'dan kaldırıyoruz).
  const actionSlot =
    !editing && canEdit ? (
      <>
        {hasContent && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={copy.descriptionCopyAction}
                >
                  <CopyIcon className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copy.descriptionCopyAction}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDownload}
                  disabled={downloadPending}
                  aria-label={
                    downloadPending
                      ? copy.descriptionDownloadPending
                      : copy.descriptionDownloadAction
                  }
                >
                  {downloadPending ? (
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileTextIcon className="size-4" aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {downloadPending
                  ? copy.descriptionDownloadPending
                  : copy.descriptionDownloadAction}
              </TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={start}
              aria-label={hasContent ? copy.descriptionEditAction : copy.descriptionAdd}
            >
              {hasContent ? (
                <PencilIcon className="size-4" aria-hidden />
              ) : (
                <PlusIcon className="size-4" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasContent ? copy.descriptionEditAction : copy.descriptionAdd}
          </TooltipContent>
        </Tooltip>
      </>
    ) : null;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <SectionHeader
        icon={<AlignLeftIcon className="size-3.5" aria-hidden />}
        action={actionSlot}
        className={HEADER_CLASS}
      >
        {copy.descriptionTitle}
      </SectionHeader>

      <div className="pusula-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {editing && canEdit ? (
          <>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancel}
                disabled={pending}
              >
                {copy.descriptionCancelAction}
              </Button>
            </div>
          </>
        ) : hasContent ? (
          <RichTextContent value={current} />
        ) : canEdit ? (
          <button
            type="button"
            onClick={start}
            className="block w-full cursor-pointer rounded-md bg-muted/40 p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {copy.descriptionEmptyPrompt}
          </button>
        ) : (
          <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            {copy.descriptionEmpty}
          </p>
        )}
      </div>
    </section>
  );
}

/** HTML attribute/text içine kart başlığını güvenli gömme (download HTML title). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
