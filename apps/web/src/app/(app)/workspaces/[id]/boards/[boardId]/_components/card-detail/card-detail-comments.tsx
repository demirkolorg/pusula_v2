'use client';

import { useState } from 'react';
import { commentBodySchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';

export type CommentView = {
  id: string;
  authorId: string;
  body: string;
  editedAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
};

type CardDetailCommentsProps = {
  comments: CommentView[];
  /** Resolve a user id to a display name (board/card members); falls back inside. */
  nameOf: (userId: string) => string | null | undefined;
  /** The viewer's own user id. */
  viewerUserId: string;
  /** Whether the viewer is a board `admin` (may edit/delete others' comments). */
  isBoardAdmin: boolean;
  /** Board `member+` and board active — may add a comment / edit-or-delete own. */
  canComment: boolean;
  onCreate: (body: string) => void;
  onEdit: (input: { commentId: string; body: string }) => void;
  onDelete: (commentId: string) => void;
  pending?: boolean;
  error?: string | null;
};

function NewCommentForm({ onSubmit, pending }: { onSubmit: (body: string) => void; pending: boolean }) {
  const copy = strings.card.comments;
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = commentBodySchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
          return;
        }
        setError(null);
        onSubmit(parsed.data);
        setValue('');
      }}
      noValidate
      className="space-y-2"
    >
      <Textarea
        name="commentBody"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.addPlaceholder}
        aria-label={copy.addPlaceholder}
        disabled={pending}
        rows={3}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? copy.adding : copy.addSubmit}
      </Button>
    </form>
  );
}

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
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleted = comment.deletedAt != null;

  return (
    <li className="space-y-1 rounded-md border p-3 text-sm">
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = commentBodySchema.safeParse(value);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
              return;
            }
            setError(null);
            if (parsed.data !== comment.body) onEdit(parsed.data);
            setEditing(false);
          }}
          noValidate
          className="space-y-2"
        >
          <Textarea
            name="commentBody"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.edit}
            disabled={pending}
            rows={3}
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? copy.editSaving : copy.editSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue(comment.body);
                setError(null);
                setEditing(false);
              }}
            >
              {copy.editCancel}
            </Button>
          </div>
        </form>
      ) : (
        <p className="break-words whitespace-pre-wrap">{comment.body}</p>
      )}

      {!deleted && canEdit && !editing && (
        <div className="flex gap-1 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setValue(comment.body);
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
            <DialogContent>
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
    </li>
  );
}

/**
 * Card comments: oldest-first list. Each row shows the author's name (resolved
 * via `nameOf`, falling back to the user id then a generic label), the date, an
 * "(edited)" marker, and the body — or a "deleted" placeholder for soft-deleted
 * rows. Board `member+` may add a comment; the author (or a board `admin`) may
 * edit / delete (confirmed) their own. Presentational — the dialog wires the
 * mutations.
 */
export function CardDetailComments({
  comments,
  nameOf,
  viewerUserId,
  isBoardAdmin,
  canComment,
  onCreate,
  onEdit,
  onDelete,
  pending = false,
  error,
}: CardDetailCommentsProps) {
  const copy = strings.card.comments;

  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const canEditThis =
              canComment && (comment.authorId === viewerUserId || isBoardAdmin);
            const authorName = nameOf(comment.authorId)?.toString().trim() || comment.authorId || copy.unknownAuthor;
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

      {canComment && <NewCommentForm onSubmit={onCreate} pending={pending} />}
    </section>
  );
}
