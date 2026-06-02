'use client';

import { useState } from 'react';
import { CheckIcon, MessageSquareIcon, PencilIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import { checklistItemContentSchema } from '@pusula/domain';
import {
  Avatar,
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ChecklistItemThread } from './checklist-item-thread';
import type {
  ChecklistCommentContext,
  ChecklistItemView,
  ImageResolver,
  NameResolver,
} from './checklist-types';

export type { ChecklistCommentContext } from './checklist-types';

/**
 * One checklist item: a `Checkbox` + content, with inline edit/delete for board
 * `member+`. A completed item shows the completer's avatar (resolved via
 * `nameOf`, when known). Viewers see a disabled checkbox and no affordances.
 */
export function ChecklistItemRow({
  item,
  canEdit,
  pending,
  nameOf,
  imageOf,
  comments,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItemView;
  canEdit: boolean;
  pending: boolean;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  /** Comment-thread context — when present, the row shows a thread toggle. */
  comments?: ChecklistCommentContext;
  onToggle: (completed: boolean) => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
}) {
  const copy = strings.card.checklist;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.content);
  const [error, setError] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const commentCount = item.commentCount;

  const completerName =
    item.completed && item.completedBy
      ? nameOf?.(item.completedBy)?.toString().trim() || null
      : null;
  const completerImage =
    item.completed && item.completedBy ? (imageOf?.(item.completedBy) ?? null) : null;

  return (
    <li className="group/item text-sm">
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!canEdit || editing}>
          <div className="flex items-start gap-2">
      <Checkbox
        checked={item.completed}
        disabled={!canEdit || pending}
        aria-label={copy.itemToggleLabel}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5 shrink-0"
      />
      {editing && canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = checklistItemContentSchema.safeParse(value);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
              return;
            }
            setError(null);
            if (parsed.data !== item.content) onEdit(parsed.data);
            setEditing(false);
          }}
          noValidate
          className="flex-1 space-y-2"
        >
          <Input
            name="itemContent"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.itemEdit}
            disabled={pending}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? copy.itemSaving : copy.itemSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue(item.content);
                setError(null);
                setEditing(false);
              }}
            >
              {copy.itemCancel}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {comments ? (
            // Yorum mümkünse madde metni tıklanabilir — tıklayınca thread
            // açılır/kapanır (kart açar gibi). Sağ tık yine context menüyü açar.
            <button
              type="button"
              aria-expanded={threadOpen}
              onClick={() => setThreadOpen((open) => !open)}
              className={cn(
                'focus-visible:ring-ring/60 min-w-0 flex-1 break-words rounded-sm text-left outline-none focus-visible:ring-2',
                item.completed && 'italic text-muted-foreground/70',
              )}
            >
              {item.content}
            </button>
          ) : (
            <span
              className={
                item.completed
                  ? 'min-w-0 flex-1 break-words italic text-muted-foreground/70'
                  : 'min-w-0 flex-1 break-words'
              }
            >
              {item.content}
            </span>
          )}
          {/* İşlem yapan (tamamlayan) avatarı + yorum rozeti tek bir
              dikey-ortalı grupta hizalanır. Yorum rozeti satırda kalır —
              yorum yetkisi (canComment) edit yetkisinden bağımsız ve viewer
              da thread açabildiği için context menüye taşınmadı.
              `commentCount > 0` ise rozet hep görünür; 0 ise yalnız
              hover/focus/touch'ta. Düzenle/sil/tamamla eylemleri maddeye
              sağ tık (context) menüsünde. */}
          {(completerName || comments) && (
            <div className="flex shrink-0 items-center gap-1 self-start">
              {completerName && (
                <Avatar name={completerName} image={completerImage} size="xs" />
              )}
              {comments && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        threadOpen ? copy.itemCommentsToggleClose : copy.itemCommentsToggle
                      }
                      aria-expanded={threadOpen}
                      className={cn(
                        'text-muted-foreground hover:text-foreground size-6 gap-1 px-1.5 touch:size-11',
                        commentCount === 0 &&
                          'opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 touch:opacity-100',
                        threadOpen && 'text-foreground opacity-100',
                      )}
                      onClick={() => setThreadOpen((open) => !open)}
                    >
                      <MessageSquareIcon className="size-3.5" aria-hidden />
                      {commentCount > 0 && (
                        <span className="text-[11px] font-medium tabular-nums">
                          {commentCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {threadOpen ? copy.itemCommentsToggleClose : copy.itemCommentsToggle}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </>
      )}
          </div>
        </ContextMenuTrigger>
        {canEdit && !editing && (
          <ContextMenuContent aria-label={copy.itemActions}>
            <ContextMenuItem disabled={pending} onSelect={() => onToggle(!item.completed)}>
              {item.completed ? (
                <SquareIcon className="size-3.5" aria-hidden />
              ) : (
                <CheckIcon className="size-3.5" aria-hidden />
              )}
              {item.completed ? copy.itemUntoggleLabel : copy.itemToggleLabel}
            </ContextMenuItem>
            {comments && (
              <ContextMenuItem onSelect={() => setThreadOpen(true)}>
                <MessageSquareIcon className="size-3.5" aria-hidden />
                {copy.itemCommentsToggle}
              </ContextMenuItem>
            )}
            <ContextMenuItem
              disabled={pending}
              onSelect={() => {
                setValue(item.content);
                setEditing(true);
              }}
            >
              <PencilIcon className="size-3.5" aria-hidden />
              {copy.itemEdit}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" disabled={pending} onSelect={onDelete}>
              <Trash2Icon className="size-3.5" aria-hidden />
              {copy.itemDelete}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {comments && threadOpen && (
        <ChecklistItemThread
          cardId={comments.cardId}
          checklistItemId={item.id}
          canComment={comments.canComment}
          isBoardAdmin={comments.isBoardAdmin}
          viewerUserId={comments.viewerUserId}
          viewerName={comments.viewerName}
          viewerImage={comments.viewerImage}
          nameOf={(userId) => nameOf?.(userId)}
          imageOf={imageOf ? (userId) => imageOf(userId) : undefined}
          mentions={comments.mentions}
        />
      )}
    </li>
  );
}
