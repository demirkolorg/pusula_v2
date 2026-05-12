'use client';

import { useState } from 'react';
import { MessageSquareIcon, SendIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Avatar,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  RichTextContent,
  RichTextEditor,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { isSameRichText } from './rich-text-helpers';

export type CommentView = {
  id: string;
  authorId: string;
  body: string;
  editedAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
};

/** Localised labels for the shared {@link RichTextEditor}. */
const richTextLabels = strings.card.detail.richText;

// ---------------------------------------------------------------------------
// Composer — a mini rich-text editor + "send" button. Lives in the modal's
// right-panel header (above the tabs), independent of the active tab.
// ---------------------------------------------------------------------------

type CardCommentComposerProps = {
  /** Display name of the viewer (for the avatar). */
  viewerName: string | null;
  onSubmit: (body: string) => void;
  pending?: boolean;
  error?: string | null;
};

export function CardCommentComposer({ viewerName, onSubmit, pending = false, error }: CardCommentComposerProps) {
  const copy = strings.card.detail;
  // `null` ⇒ a fresh/empty editor; a non-empty string ⇒ the in-progress draft.
  // Resetting `value` to `null` after submit makes the editor resync to empty.
  const [value, setValue] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  // Bumping the key remounts the editor — the simplest reliable "clear" given
  // the editor only resyncs `value` on an external change.
  const [resetSeq, setResetSeq] = useState(0);

  const submit = () => {
    if (empty || value == null) return;
    onSubmit(value);
    setValue(null);
    setEmpty(true);
    setResetSeq((n) => n + 1);
  };

  return (
    <div className="flex items-start gap-2">
      <Avatar name={viewerName} size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
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
            placeholder={copy.composer.placeholder}
            labels={richTextLabels}
            toolbar="mini"
            ariaLabel={copy.composer.placeholder}
            disabled={pending}
            onChange={(serialized, isEmpty) => {
              setValue(isEmpty ? null : serialized);
              setEmpty(isEmpty);
            }}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={pending || empty} onClick={submit}>
            <SendIcon className="size-3.5" />
            {pending ? copy.composer.submitting : copy.composer.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment row — author + time + rich-text body (or "deleted" placeholder), with
// inline edit / confirmed delete for the author (or a board admin).
// ---------------------------------------------------------------------------

function CommentRow({
  comment,
  authorName,
  canEdit,
  pending,
  onEdit,
  onDelete,
}: {
  comment: CommentView;
  authorName: string;
  canEdit: boolean;
  pending: boolean;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const copy = strings.card.comments;
  const detailCopy = strings.card.detail;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [editorEmpty, setEditorEmpty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleted = comment.deletedAt != null;

  return (
    <li className="flex items-start gap-2">
      <Avatar name={authorName} size="sm" />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{authorName}</span>
          <span className="text-muted-foreground text-xs">{formatDate(comment.createdAt)}</span>
          {!deleted && comment.editedAt != null && (
            <span className="text-muted-foreground text-xs">{copy.editedSuffix}</span>
          )}
        </div>

        {deleted ? (
          <p className="text-muted-foreground italic">{copy.deletedPlaceholder}</p>
        ) : editing && canEdit ? (
          <div className="space-y-1.5">
            <RichTextEditor
              value={draft || null}
              placeholder={detailCopy.composer.placeholder}
              labels={richTextLabels}
              toolbar="mini"
              ariaLabel={copy.edit}
              disabled={pending}
              onChange={(serialized, isEmpty) => {
                setDraft(serialized);
                setEditorEmpty(isEmpty);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending || editorEmpty}
                onClick={() => {
                  // No-op when the body is *semantically* unchanged — including
                  // the case where `comment.body` is legacy plain text and
                  // `draft` is its Tiptap JSON serialisation (raw strings differ).
                  if (!isSameRichText(draft, comment.body)) onEdit(draft);
                  setEditing(false);
                }}
              >
                {pending ? copy.editSaving : copy.editSave}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
              >
                {copy.editCancel}
              </Button>
            </div>
          </div>
        ) : (
          <RichTextContent value={comment.body} />
        )}

        {!deleted && canEdit && !editing && (
          <div className="flex gap-1 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setDraft(comment.body);
                setEditing(true);
              }}
            >
              {copy.edit}
            </Button>
            <Dialog
              open={deleteOpen}
              onOpenChange={(next) => {
                if (pending) return;
                setDeleteOpen(next);
              }}
            >
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
                {copy.delete}
              </Button>
              <DialogContent closeLabel={strings.common.close}>
                <DialogHeader>
                  <DialogTitle>{copy.deleteConfirmTitle}</DialogTitle>
                  <DialogDescription>{copy.deleteConfirmDescription}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={pending}>
                      {strings.common.cancel}
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      onDelete();
                      setDeleteOpen(false);
                    }}
                  >
                    {pending ? copy.deleting : copy.deleteConfirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

type CardDetailCommentsProps = {
  comments: CommentView[];
  /** Resolve a user id to a display name (board/card members); falls back inside. */
  nameOf: (userId: string) => string | null | undefined;
  /** The viewer's own user id. */
  viewerUserId: string;
  /** Whether the viewer is a board `admin` (may edit/delete others' comments). */
  isBoardAdmin: boolean;
  /** Board `member+` and board active — may edit-or-delete own. */
  canComment: boolean;
  onEdit: (input: { commentId: string; body: string }) => void;
  onDelete: (commentId: string) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card comments — newest-first list of rows (author avatar + name + time + the
 * rich-text body, or a "deleted" placeholder). The author (or a board `admin`)
 * may edit / delete (confirmed) their own. The composer lives separately in the
 * modal sidebar header — see {@link CardCommentComposer}. Presentational; the
 * dialog wires the mutations.
 */
export function CardDetailComments({
  comments,
  nameOf,
  viewerUserId,
  isBoardAdmin,
  canComment,
  onEdit,
  onDelete,
  pending = false,
  error,
}: CardDetailCommentsProps) {
  const copy = strings.card.comments;

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {comments.length === 0 ? (
        <EmptyState icon={<MessageSquareIcon className="size-8" />} message={copy.empty} />
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => {
            const canEditThis = canComment && (comment.authorId === viewerUserId || isBoardAdmin);
            const authorName =
              nameOf(comment.authorId)?.toString().trim() || comment.authorId || copy.unknownAuthor;
            return (
              <CommentRow
                key={comment.id}
                comment={comment}
                authorName={authorName}
                canEdit={canEditThis}
                pending={pending}
                onEdit={(body) => onEdit({ commentId: comment.id, body })}
                onDelete={() => onDelete(comment.id)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
