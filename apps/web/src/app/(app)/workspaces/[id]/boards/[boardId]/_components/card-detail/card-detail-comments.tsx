'use client';

import { useState } from 'react';
import {
  CopyIcon,
  MessageSquareIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Avatar,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
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
  cn,
  toast,
  type MentionSource,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { copyRichTextToClipboard, isSameRichText } from './rich-text-helpers';

export type CommentView = {
  id: string;
  // Faz 9A (DEM-127) share-link sonrası comments.authorId nullable: misafir
  // yorumlarda `null` taşır, UI tarafında "Misafir" olarak resolve edilir.
  authorId: string | null;
  body: string;
  editedAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
};

/** Localised labels for the shared {@link RichTextEditor}. */
const richTextLabels = strings.card.detail.richText;

// ---------------------------------------------------------------------------
// Composer — a mini rich-text editor + "send" button in a self-contained card.
// Lives at the top of the sidebar's "Yorumlar" tab (above the comment list).
// ---------------------------------------------------------------------------

type CardCommentComposerProps = {
  /** Display name of the viewer (for the avatar). */
  viewerName: string | null;
  /** Avatar URL of the viewer (`null` when unset — falls back to initials). */
  viewerImage?: string | null;
  onSubmit: (body: string) => void;
  pending?: boolean;
  error?: string | null;
  /** Optional @-mention picker source (board members) — when omitted, no picker. */
  mentions?: MentionSource;
  /**
   * Kompakt varyant: kart kabuğu (border + dolgu + gölge) ve avatar kaldırılır.
   * Checklist maddesi yorum thread'inde, iç içe kart kalabalığını azaltmak için.
   */
  compact?: boolean;
};

export function CardCommentComposer({
  viewerName,
  viewerImage = null,
  onSubmit,
  pending = false,
  error,
  mentions,
  compact = false,
}: CardCommentComposerProps) {
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
    <div
      className={cn(
        'flex items-start gap-2',
        !compact &&
          'bg-card focus-within:border-ring/45 rounded-lg border p-2.5 shadow-xs transition-colors',
      )}
    >
      {!compact && <Avatar name={viewerName} image={viewerImage} size="sm" />}
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
            // Kompakt (thread) composer'da toolbar boşta gizli, odakta açılır.
            collapsibleToolbar={compact}
            ariaLabel={copy.composer.placeholder}
            disabled={pending}
            mentions={mentions}
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
        <div className="flex items-center justify-end gap-2">
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
  authorImage,
  canEdit,
  pending,
  onEdit,
  onDelete,
  mentions,
  compact = false,
}: {
  comment: CommentView;
  authorName: string;
  authorImage: string | null;
  canEdit: boolean;
  pending: boolean;
  onEdit: (body: string) => void;
  onDelete: () => void;
  mentions?: MentionSource;
  /** Kompakt varyant: yorum satırı kart kabuğu olmadan render edilir. */
  compact?: boolean;
}) {
  const copy = strings.card.comments;
  const detailCopy = strings.card.detail;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [editorEmpty, setEditorEmpty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleted = comment.deletedAt != null;

  // Yorum gövdesini panoya kopyala — Tiptap JSON'dan HTML + düz metin (kart
  // açıklaması "Kopyala" ile aynı davranış). Yetkiden bağımsız; okuma yetkisi
  // olan da kopyalayabilir (kopyalama yıkıcı değil). Erişilemezse uyarı.
  const handleCopy = async () => {
    try {
      await copyRichTextToClipboard(comment.body);
      toast.success(copy.copySuccess);
    } catch {
      toast.error(copy.copyError);
    }
  };

  return (
    <li
      // Bildirim deep-link hedefi: `useTargetFlash` bu id ile satırı bulup
      // scroll + flash uygular (apps/web card-detail-dialog).
      data-comment-id={comment.id}
      className={cn(
        'group rounded-lg transition-colors',
        compact ? '' : 'bg-card/55 hover:bg-accent/35 border p-2',
      )}
    >
      <ContextMenu>
        {/* Düzenleme (inline editor) sırasında context menüyü açma — kullanıcı
            metin düzenliyor olabilir, normal metin context menüsü çıksın.
            Silinmiş yorumda da menü yok (kopyalanacak/düzenlenecek içerik yok).
            Salt-okur (canEdit=false) durumda menü açılır: yalnızca "Kopyala"
            görünür (checklist maddesiyle aynı desen). */}
        <ContextMenuTrigger asChild disabled={editing || deleted}>
          <div className="flex items-start gap-2">
            <Avatar name={authorName} image={authorImage} size={compact ? 'xs' : 'sm'} />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{authorName}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(comment.createdAt)}
                </span>
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
                    mentions={mentions}
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
                        // No-op when the body is *semantically* unchanged —
                        // including the case where `comment.body` is legacy plain
                        // text and `draft` is its Tiptap JSON serialisation (raw
                        // strings differ).
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
              ) : compact ? (
                // Sohbet baloncuğu — gövde hafif arka planlı, içeriğe göre genişler.
                <div className="bg-muted/60 w-fit max-w-full rounded-2xl rounded-tl-sm px-3 py-1.5">
                  <RichTextContent value={comment.body} />
                </div>
              ) : (
                <RichTextContent value={comment.body} />
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        {!deleted && !editing && (
          <ContextMenuContent aria-label={copy.actions}>
            {/* Kopyala — yetkiden bağımsız, her zaman görünür. */}
            <ContextMenuItem onSelect={() => void handleCopy()}>
              <CopyIcon className="size-3.5" aria-hidden />
              {copy.copy}
            </ContextMenuItem>
            {canEdit && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={pending}
                  onSelect={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                  {copy.edit}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  disabled={pending}
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2Icon className="size-3.5" aria-hidden />
                  {copy.delete}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenu>

      {/* Silme onayı — context menü "Sil" bunu açar; yorum silmek yıkıcı olduğu
          için doğrudan değil onaylı. */}
      {!deleted && canEdit && (
        <Dialog
          open={deleteOpen}
          onOpenChange={(next) => {
            if (pending) return;
            setDeleteOpen(next);
          }}
        >
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
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

type CardDetailCommentsProps = {
  comments: CommentView[];
  /** Resolve a user id to a display name (board/card members); falls back inside. */
  nameOf: (userId: string) => string | null | undefined;
  /** Resolve a user id to an avatar URL (board/card members; `null` when unset). */
  imageOf?: (userId: string) => string | null;
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
  /** Optional @-mention picker source — forwarded to the inline edit editor. */
  mentions?: MentionSource;
  /** Kompakt varyant: satırlar kart kabuğu olmadan, daha sıkı aralıkla. */
  compact?: boolean;
};

/**
 * Card comments — newest-first list of rows (author avatar + name + time + the
 * rich-text body, or a "deleted" placeholder). Each row is a hover-highlighted
 * card; the author (or a board `admin`) may edit / delete (confirmed) their own
 * via actions that surface on hover. The composer sits above the list in the
 * "Yorumlar" tab — see {@link CardCommentComposer}. Presentational; the
 * dialog wires the mutations.
 */
export function CardDetailComments({
  comments,
  nameOf,
  imageOf,
  viewerUserId,
  isBoardAdmin,
  canComment,
  onEdit,
  onDelete,
  pending = false,
  error,
  mentions,
  compact = false,
}: CardDetailCommentsProps) {
  const copy = strings.card.comments;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-3'}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {comments.length === 0 ? (
        compact ? null : (
          <EmptyState icon={<MessageSquareIcon className="size-8" />} message={copy.empty} />
        )
      ) : (
        <ul className={compact ? 'space-y-2' : 'space-y-3'}>
          {comments.map((comment) => {
            const canEditThis =
              canComment &&
              comment.authorId !== null &&
              (comment.authorId === viewerUserId || isBoardAdmin);
            // Faz 9A (DEM-127): authorId null → misafir yorum; nameOf çağrılmaz,
            // copy.unknownAuthor (örn. "Misafir") fallback kullanılır.
            const authorName =
              (comment.authorId &&
                (nameOf(comment.authorId)?.toString().trim() || comment.authorId)) ||
              copy.unknownAuthor;
            // Misafir yorumda (authorId null) avatar yok — initials fallback.
            const authorImage = comment.authorId
              ? (imageOf?.(comment.authorId) ?? null)
              : null;
            return (
              <CommentRow
                key={comment.id}
                comment={comment}
                authorName={authorName}
                authorImage={authorImage}
                canEdit={canEditThis}
                pending={pending}
                onEdit={(body) => onEdit({ commentId: comment.id, body })}
                onDelete={() => onDelete(comment.id)}
                mentions={mentions}
                compact={compact}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
