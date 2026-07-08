'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CheckIcon,
  CopyIcon,
  GripVerticalIcon,
  ListPlusIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  Avatar,
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  RichTextContent,
  RichTextEditor,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ChecklistItemAttachments } from './checklist-item-attachments';
import { ChecklistItemThread } from './checklist-item-thread';
import { copyRichTextToClipboard, isSameRichText } from './rich-text-helpers';
import type {
  ChecklistAttachmentContext,
  ChecklistCommentContext,
  ChecklistItemView,
  ImageResolver,
  NameResolver,
} from './checklist-types';

export type { ChecklistAttachmentContext, ChecklistCommentContext } from './checklist-types';

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
  attachments,
  onToggle,
  onEdit,
  onDelete,
  canAddSubItem = false,
  onAddSubItem,
  registerDnd,
  dragging = false,
  dropEdge = null,
  children,
}: {
  item: ChecklistItemView;
  canEdit: boolean;
  pending: boolean;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  /** Comment-thread context — when present, the row shows a thread toggle. */
  comments?: ChecklistCommentContext;
  /** Attachment context — when present, the row shows an attachment toggle. */
  attachments?: ChecklistAttachmentContext;
  onToggle: (completed: boolean) => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  /**
   * İç içe (nested) madde — bu maddenin altına alt madde eklenebilir mi (derinlik
   * sınırı `CHECKLIST_MAX_DEPTH` altında). `true` ise context menüde "Alt madde
   * ekle" görünür ve `onAddSubItem` tetiklenir.
   */
  canAddSubItem?: boolean;
  /** "Alt madde ekle" seçilince — üst bileşen bu maddenin altına ekleme formunu açar. */
  onAddSubItem?: () => void;
  /**
   * Register this row with the checklist's drag-and-drop (Pragmatic DnD).
   * Receives the row element + its drag handle; returns a cleanup. Absent /
   * `undefined` ⇒ reorder disabled (read-only or share view) — no handle shown.
   */
  registerDnd?: (element: HTMLElement, dragHandle: HTMLElement) => () => void;
  /** Whether this row is the one currently being dragged (source ghost). */
  dragging?: boolean;
  /** Drop indicator edge for this row (`null` when not a drop target). */
  dropEdge?: 'top' | 'bottom' | null;
  /** Alt ağaç (bu maddenin çocukları) + "alt madde ekle" formu — `<li>` içinde render. */
  children?: ReactNode;
}) {
  const copy = strings.card.checklist;
  const richTextLabels = strings.card.detail.richText;
  const [editing, setEditing] = useState(false);
  // Madde metni artık zengin (Tiptap); `draft` düzenlenen Tiptap JSON string.
  const [draft, setDraft] = useState<string>(item.content);
  const [editorEmpty, setEditorEmpty] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const commentCount = item.commentCount;
  const attachmentCount = item.attachmentCount;
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  // Pragmatic DnD kaydı — satır + tutamaç hazır olduğunda; editing sırasında
  // (inline form) sürükleme devre dışı (handle gizli). Cleanup unmount/değişimde.
  useEffect(() => {
    const row = rowRef.current;
    const handle = handleRef.current;
    if (!registerDnd || !row || !handle || editing) return;
    return registerDnd(row, handle);
  }, [registerDnd, editing, item.id]);

  const completerName =
    item.completed && item.completedBy
      ? nameOf?.(item.completedBy)?.toString().trim() || null
      : null;
  const completerImage =
    item.completed && item.completedBy ? (imageOf?.(item.completedBy) ?? null) : null;

  const showHandle = Boolean(registerDnd) && canEdit && !editing;

  // Madde metnini panoya kopyala — yetkiden bağımsız (okuma yetkisi olan da
  // kopyalayabilir; kopyalama yıkıcı değil). Zengin metni HTML + düz metin olarak
  // kopyalar (ham JSON değil). Clipboard erişilemezse uyarı.
  const handleCopy = async () => {
    try {
      await copyRichTextToClipboard(item.content);
      toast.success(copy.itemCopied);
    } catch {
      toast.error(copy.itemCopyError);
    }
  };

  // Inline düzenlemeyi kaydet — boş-doc engellenir; içerik *anlamsal* olarak
  // değişmediyse (legacy düz metin ↔ Tiptap JSON serileştirmesi dahil) no-op.
  const saveEdit = () => {
    if (editorEmpty) return;
    if (!isSameRichText(draft, item.content)) onEdit(draft);
    setEditing(false);
  };

  return (
    <li
      ref={rowRef}
      // Bildirim deep-link hedefi: `useTargetFlash` bu id ile maddeyi bulup
      // scroll + flash uygular (apps/web card-detail-dialog).
      data-checklist-item-id={item.id}
      className={cn(
        'group/item relative text-sm',
        dragging && 'opacity-40',
        // Drop göstergesi: hedef satırın üst/alt kenarında ince çizgi.
        dropEdge === 'top' &&
          'before:bg-primary before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:rounded-full before:content-[""]',
        dropEdge === 'bottom' &&
          'after:bg-primary after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:content-[""]',
      )}
    >
      <ContextMenu>
        {/* Düzenleme (inline form) sırasında context menüyü açma — kullanıcı
            metin düzenliyor olabilir, normal metin context menüsü çıksın.
            Salt-okur (canEdit=false) durumda da açılır: yalnızca "Kopyala"
            görünür (kopyalama yıkıcı değil, okuma yetkisi olan kopyalayabilir). */}
        <ContextMenuTrigger asChild disabled={editing}>
          <div className="flex items-start gap-1.5">
      {/* Sürükle tutamacı — yalnız düzenlenebilir + DnD aktifken. Sürüklerken
          satır yüksekliği değişmesin diye editing/viewer'da yer ayrılmaz; grip
          klavyeyle odaklanabilir ve aria-label taşır (erişilebilirlik). */}
      {showHandle ? (
        <button
          ref={handleRef}
          type="button"
          aria-label={copy.itemDragHandle}
          className="text-muted-foreground/50 hover:text-foreground focus-visible:ring-ring/60 mt-0.5 shrink-0 cursor-grab touch-none rounded-sm opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 group-hover/item:opacity-100 group-focus-within/item:opacity-100 active:cursor-grabbing touch:opacity-100"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
      ) : null}
      <Checkbox
        checked={item.completed}
        disabled={!canEdit || pending}
        aria-label={copy.itemToggleLabel}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5 shrink-0"
      />
      {editing && canEdit ? (
        <div className="flex-1 space-y-2">
          {/* Enter = yeni satır (Tiptap); kaydet = Cmd/Ctrl+Enter veya "Kaydet". */}
          <div
            onKeyDownCapture={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
              }
            }}
          >
            <RichTextEditor
              value={draft || null}
              placeholder={copy.itemPlaceholder}
              labels={richTextLabels}
              toolbar="mini"
              collapsibleToolbar
              ariaLabel={copy.itemEdit}
              disabled={pending}
              onChange={(serialized, isEmpty) => {
                setDraft(serialized);
                setEditorEmpty(isEmpty);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending || editorEmpty} onClick={saveEdit}>
              {pending ? copy.itemSaving : copy.itemSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setDraft(item.content);
                setEditorEmpty(false);
                setEditing(false);
              }}
            >
              {copy.itemCancel}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Madde metni artık zengin (Tiptap) render edilir. Önceki "metne tıkla
              → thread aç" davranışı kaldırıldı: RichTextContent link/tıklanabilir
              içerik taşıyabildiğinden buton'a gömülemez; thread yalnızca sağdaki
              mesaj rozetinden açılır (yorum/açıklama ile tutarlı). */}
          <div
            className={cn('min-w-0 flex-1 break-words', item.completed && 'italic opacity-60')}
          >
            <RichTextContent value={item.content} />
          </div>
          {/* İşlem yapan (tamamlayan) avatarı + yorum rozeti tek bir
              dikey-ortalı grupta hizalanır. Yorum rozeti satırda kalır —
              yorum yetkisi (canComment) edit yetkisinden bağımsız ve viewer
              da thread açabildiği için context menüye taşınmadı.
              `commentCount > 0` ise rozet hep görünür; 0 ise yalnız
              hover/focus/touch'ta. Düzenle/sil/tamamla eylemleri maddeye
              sağ tık (context) menüsünde. */}
          {(completerName || comments || attachments) && (
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
              {/* Ek rozeti — yorum rozetiyle birebir simetrik. Ek yetkisi
                  (canEdit) edit yetkisinden bağımsız değil (upload edit gerektirir)
                  ama viewer da galeriyi açıp görebildiğinden rozet her zaman
                  (attachments context varsa) görünür. `attachmentCount > 0` ise
                  hep görünür; 0 ise yalnız hover/focus/touch'ta. */}
              {attachments && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        attachmentsOpen
                          ? copy.itemAttachmentsToggleClose
                          : copy.itemAttachmentsToggle
                      }
                      aria-expanded={attachmentsOpen}
                      className={cn(
                        'text-muted-foreground hover:text-foreground size-6 gap-1 px-1.5 touch:size-11',
                        attachmentCount === 0 &&
                          'opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 touch:opacity-100',
                        attachmentsOpen && 'text-foreground opacity-100',
                      )}
                      onClick={() => setAttachmentsOpen((open) => !open)}
                    >
                      <PaperclipIcon className="size-3.5" aria-hidden />
                      {attachmentCount > 0 && (
                        <span className="text-[11px] font-medium tabular-nums">
                          {attachmentCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {attachmentsOpen
                      ? copy.itemAttachmentsToggleClose
                      : copy.itemAttachmentsToggle}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </>
      )}
          </div>
        </ContextMenuTrigger>
        {!editing && (
          <ContextMenuContent aria-label={copy.itemActions}>
            {/* Kopyala — yetkiden bağımsız, her zaman görünür. */}
            <ContextMenuItem onSelect={() => void handleCopy()}>
              <CopyIcon className="size-3.5" aria-hidden />
              {copy.itemContextCopy}
            </ContextMenuItem>
            {comments && (
              <ContextMenuItem onSelect={() => setThreadOpen(true)}>
                <MessageSquareIcon className="size-3.5" aria-hidden />
                {copy.itemCommentsToggle}
              </ContextMenuItem>
            )}
            {attachments && (
              <ContextMenuItem onSelect={() => setAttachmentsOpen(true)}>
                <PaperclipIcon className="size-3.5" aria-hidden />
                {copy.itemAttachmentsToggle}
              </ContextMenuItem>
            )}
            {canEdit && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={pending}
                  onSelect={() => onToggle(!item.completed)}
                >
                  {item.completed ? (
                    <SquareIcon className="size-3.5" aria-hidden />
                  ) : (
                    <CheckIcon className="size-3.5" aria-hidden />
                  )}
                  {item.completed ? copy.itemUntoggleLabel : copy.itemToggleLabel}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={pending}
                  onSelect={() => {
                    setDraft(item.content);
                    setEditorEmpty(false);
                    setEditing(true);
                  }}
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                  {copy.itemEdit}
                </ContextMenuItem>
                {/* İç içe madde: yalnız derinlik sınırı altındaki maddede görünür. */}
                {canAddSubItem && onAddSubItem && (
                  <ContextMenuItem disabled={pending} onSelect={onAddSubItem}>
                    <ListPlusIcon className="size-3.5" aria-hidden />
                    {copy.itemAddSubAction}
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" disabled={pending} onSelect={onDelete}>
                  <Trash2Icon className="size-3.5" aria-hidden />
                  {copy.itemDelete}
                </ContextMenuItem>
              </>
            )}
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

      {attachments && attachmentsOpen && (
        <ChecklistItemAttachments
          cardId={attachments.cardId}
          checklistItemId={item.id}
          canEdit={attachments.canEdit}
          isBoardAdmin={attachments.isBoardAdmin}
          viewerUserId={attachments.viewerUserId}
        />
      )}

      {/* İç içe (nested) alt ağaç + "alt madde ekle" formu — üst bileşen girintili
          bir <ul> olarak geçirir; maddenin kendi <li>'si içinde kalır (DOM ağacı
          domain ağacını yansıtır). */}
      {children}
    </li>
  );
}
