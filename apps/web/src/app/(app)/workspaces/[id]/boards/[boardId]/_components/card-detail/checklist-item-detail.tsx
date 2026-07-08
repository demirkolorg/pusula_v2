'use client';

import { CheckIcon, MessageSquareIcon, PaperclipIcon, XIcon } from 'lucide-react';
import { CHECKLIST_MAX_DEPTH, type ChecklistTreeNode } from '@pusula/domain';
import { Button, Checkbox, EmptyState, RichTextContent, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddItemForm } from './checklist-add-forms';
import { ChecklistItemAttachments } from './checklist-item-attachments';
import { ChecklistItemThread } from './checklist-item-thread';
import type {
  ChecklistAttachmentContext,
  ChecklistCommentContext,
  ChecklistHandlers,
  ChecklistItemDetailTab,
  ChecklistItemView,
  ImageResolver,
  NameResolver,
} from './checklist-types';

type TreeNode = ChecklistTreeNode<ChecklistItemView>;

/**
 * Right-hand detail panel of the checklist detail-panel layout. Shows the
 * selected item's rich content + a breadcrumb (owning list title) + a "back to
 * description" affordance, then splits its expandable content across tabs —
 * **Alt maddeler / Ekler / Yorumlar** — so only one content type shows at a time
 * (the fix for the old inline "stacked panels" clutter).
 *
 * The comment + attachment tabs reuse the self-fetching {@link ChecklistItemThread}
 * / {@link ChecklistItemAttachments} verbatim (just relocated from inline rows);
 * the sub-items tab lists the item's direct children (toggle + click-to-select)
 * plus an inline "add sub-item" form (board `member+`, depth-limited).
 */
export function ChecklistItemDetail({
  node,
  checklistId,
  checklistTitle,
  tab,
  onTabChange,
  onBack,
  canEdit,
  pending,
  handlers,
  nameOf,
  imageOf,
  comments,
  attachments,
  onSelectSubItem,
}: {
  node: TreeNode;
  checklistId: string;
  checklistTitle: string;
  tab: ChecklistItemDetailTab;
  onTabChange: (tab: ChecklistItemDetailTab) => void;
  /** "Açıklamaya dön" — seçimi bırakır; dialog açıklamayı geri getirir. */
  onBack: () => void;
  canEdit: boolean;
  pending: boolean;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  comments?: ChecklistCommentContext;
  attachments?: ChecklistAttachmentContext;
  /** Alt madde satırına tıklayınca o maddeyi seç (detayı ona geçir). */
  onSelectSubItem: (itemId: string) => void;
}) {
  const copy = strings.card.checklist;

  const subCount = node.children.length;
  const canAddSub = canEdit && node.depth < CHECKLIST_MAX_DEPTH - 1;

  const tabs: Array<{ key: ChecklistItemDetailTab; label: string; icon: typeof MessageSquareIcon; count: number }> = [
    { key: 'subItems', label: copy.tabSubItems, icon: CheckIcon, count: subCount },
    ...(attachments
      ? [{ key: 'attachments' as const, label: copy.tabAttachments, icon: PaperclipIcon, count: node.attachmentCount }]
      : []),
    ...(comments
      ? [{ key: 'comments' as const, label: copy.tabComments, icon: MessageSquareIcon, count: node.commentCount }]
      : []),
  ];

  // Seçili sekme artık geçerli değilse (context kapalı) alt maddelere düş.
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'subItems';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={copy.itemDetailLabel}>
      {/* Üst: geri + breadcrumb + seçili madde metni (sabit, kaydırılmaz). */}
      <div className="shrink-0 border-b pb-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground -ml-1.5 mb-1 h-7 gap-1.5 px-2"
        >
          <XIcon className="size-3.5" aria-hidden />
          {copy.detailClose}
        </Button>
        <p className="text-muted-foreground truncate text-[11px] font-semibold tracking-wide uppercase">
          {checklistTitle}
        </p>
        <div className={cn('mt-1 text-sm break-words', node.completed && 'italic opacity-60')}>
          <RichTextContent value={node.content} />
        </div>
      </div>

      {/* Sekme çubuğu */}
      <div className="shrink-0" role="tablist" aria-label={copy.itemDetailLabel}>
        <div className="flex flex-wrap gap-1 border-b">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.key)}
                className={cn(
                  'relative -mb-px flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                      active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t.count}
                  </span>
                )}
                {active && (
                  <span className="bg-primary absolute inset-x-1.5 -bottom-px h-0.5 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sekme içeriği — kendi içinde bağımsız kayar. */}
      <div
        role="tabpanel"
        aria-label={copy.itemDetailLabel}
        className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto pt-3"
      >
        {activeTab === 'subItems' && (
          <div className="space-y-2">
            {subCount > 0 ? (
              <ul className="space-y-0.5">
                {node.children.map((child) => (
                  <SubItemRow
                    key={child.id}
                    child={child}
                    canEdit={canEdit}
                    pending={pending}
                    onToggle={(completed) =>
                      handlers.onToggleItem({ checklistId, itemId: child.id, completed })
                    }
                    onSelect={() => onSelectSubItem(child.id)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState message={copy.subItemsEmpty} />
            )}
            {canAddSub && (
              <AddItemForm
                onSubmit={(content) =>
                  handlers.onAddItem({ checklistId, content, parentItemId: node.id })
                }
                pending={pending}
                placeholder={copy.itemSubPlaceholder}
              />
            )}
          </div>
        )}

        {activeTab === 'attachments' && attachments && (
          <ChecklistItemAttachments
            cardId={attachments.cardId}
            checklistItemId={node.id}
            // `canEdit` (arşiv-duyarlı) yükleme yetkisini kapı bekçisi yapar;
            // arşivli listede galeri okunur ama yükleme gizlenir.
            canEdit={canEdit && attachments.canEdit}
            isBoardAdmin={attachments.isBoardAdmin}
            viewerUserId={attachments.viewerUserId}
            flush
          />
        )}

        {activeTab === 'comments' && comments && (
          <ChecklistItemThread
            cardId={comments.cardId}
            checklistItemId={node.id}
            isBoardAdmin={comments.isBoardAdmin}
            viewerUserId={comments.viewerUserId}
            viewerName={comments.viewerName}
            viewerImage={comments.viewerImage}
            // Arşiv-duyarlı: arşivli listede thread okunur ama composer gizli.
            canComment={canEdit && comments.canComment}
            nameOf={(userId) => nameOf?.(userId)}
            imageOf={imageOf ? (userId) => imageOf(userId) : undefined}
            mentions={comments.mentions}
            flush
          />
        )}
      </div>
    </div>
  );
}

/**
 * Detay panelinin "Alt maddeler" sekmesindeki tek bir alt madde satırı:
 * tamamla + tıkla-seç (o alt maddeye geçer). Tam düzenleme (yeniden adlandır /
 * sil / kendi alt maddesi) o maddeye geçince sol kolonda context menüde.
 */
function SubItemRow({
  child,
  canEdit,
  pending,
  onToggle,
  onSelect,
}: {
  child: TreeNode;
  canEdit: boolean;
  pending: boolean;
  onToggle: (completed: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent/50">
      <Checkbox
        checked={child.completed}
        disabled={!canEdit || pending}
        aria-label={strings.card.checklist.itemToggleLabel}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5 shrink-0"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-label={strings.card.checklist.itemSelectLabel}
        className={cn(
          'min-w-0 flex-1 cursor-pointer rounded text-left text-[13px] break-words outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          child.completed && 'italic opacity-60',
        )}
      >
        <RichTextContent value={child.content} />
      </div>
      {(child.commentCount > 0 || child.attachmentCount > 0) && (
        <span className="text-muted-foreground mt-0.5 flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums">
          {child.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <PaperclipIcon className="size-3" aria-hidden />
              {child.attachmentCount}
            </span>
          )}
          {child.commentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquareIcon className="size-3" aria-hidden />
              {child.commentCount}
            </span>
          )}
        </span>
      )}
    </li>
  );
}
