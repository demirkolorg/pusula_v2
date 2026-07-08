'use client';

import { useMemo, useState } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  CHECKLIST_MAX_DEPTH,
  buildChecklistTree,
  checklistTitleSchema,
  type ChecklistTreeNode,
} from '@pusula/domain';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Progress,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddItemForm } from './checklist-add-forms';
import { ChecklistItemRow } from './checklist-item-row';
import { useChecklistDnd, type ChecklistDnd } from './use-checklist-dnd';
import type {
  ChecklistAttachmentContext,
  ChecklistCommentContext,
  ChecklistHandlers,
  ChecklistItemDetailTab,
  ChecklistView,
  ImageResolver,
  NameResolver,
} from './checklist-types';

/**
 * One checklist card: header (inline rename + confirmed delete for board
 * `member+`), a `done/total` progress bar + line, its items, and an "add item"
 * form. Items can be reordered *within this checklist* via drag-and-drop
 * (Atlassian Pragmatic DnD — `useChecklistDnd`); a single `onReorderItem` fires
 * on drop with the resolved neighbours + optimistic position. Reorder is
 * disabled for read-only (`canEdit=false`) / archived contexts.
 */
export function ChecklistBlock({
  checklist,
  canEdit,
  archived = false,
  pending,
  handlers,
  nameOf,
  imageOf,
  comments,
  attachments,
  selectedItemId = null,
  onSelectItem,
}: {
  checklist: ChecklistView;
  canEdit: boolean;
  /**
   * Blok arşiv bölümünde mi render ediliyor (invariant 23). `true` ise salt-görünüm:
   * maddeler değiştirilemez, yeniden adlandırma/ekleme/sürükleme kapalı — menüde
   * yalnız "arşivden çıkar" ve "sil". `canEdit` yine board `member+` yetkisidir.
   */
  archived?: boolean;
  pending: boolean;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  /** Per-item comment-thread context — forwarded to each row's count badge. */
  comments?: ChecklistCommentContext;
  /** Per-item attachment context — forwarded to each row's count badge. */
  attachments?: ChecklistAttachmentContext;
  /** Şu an detay panelinde açık olan madde (bu blokta ise satır vurgulanır). */
  selectedItemId?: string | null;
  /** Bir madde seçilince (detay panelini açar) — opsiyonel deep-link sekmesiyle. */
  onSelectItem: (itemId: string, tab?: ChecklistItemDetailTab) => void;
}) {
  const copy = strings.card.checklist;
  const [renaming, setRenaming] = useState(false);
  const [titleValue, setTitleValue] = useState(checklist.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Bölümü başlığa tıklayarak aç/kapa — çok sayıda checklist varken üzerinde
  // çalışılana odaklanmayı kolaylaştırır. Bileşen-içi durum (kart kapanınca
  // sıfırlanır); kapalıyken gövde (ilerleme + maddeler + ekleme formu) gizlenir.
  // Arşivli blok default KAPALI gelir — arşiv bölümü açıldığında yalnız başlıklar
  // görünür, kullanıcı ilgilendiği listeyi tek tek açar.
  const [collapsed, setCollapsed] = useState(archived);
  const bodyId = `checklist-body-${checklist.id}`;

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.completed).length;

  // Arşivli blok salt-görünümdür (invariant 23): madde toggle/düzenle/sil, yeniden
  // adlandırma, "madde ekle" ve sürükleme kapalı — menüde yalnız arşivden çıkar /
  // sil. `editable` = board yetkisi (`canEdit`) VE arşivde değil.
  const editable = canEdit && !archived;

  // Madde sürükle-bırak sıralaması (DEM — web). Yalnız düzenlenebilir + birden
  // fazla madde varken anlamlı; drop'ta tek `onReorderItem` çağrısı (optimistic
  // patch + mutation dialog'da). Salt-okur/arşiv → enabled false → handle yok.
  const dnd = useChecklistDnd({
    checklistId: checklist.id,
    items: checklist.items,
    enabled: editable && checklist.items.length > 1,
    onReorder: (args) => handlers.onReorderItem(args),
  });

  // Düz madde listesini iç içe (nested) ağaca çevir (3 seviye). `position` yalnız
  // aynı ebeveyn (kardeşler) arasında anlamlı; `buildChecklistTree` her düzeyi
  // kendi içinde `position`'a göre sıralar + `depth`'i damgalar (girinti + sınır).
  const tree = useMemo(() => buildChecklistTree(checklist.items), [checklist.items]);

  // Seçili madde bu listede mi — detay panelini besleyen liste kartı vurgulanır
  // (kullanıcı hangi listede çalıştığını kaybetmesin).
  const isActive = selectedItemId != null && checklist.items.some((i) => i.id === selectedItemId);

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border p-3 transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20'
          : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {renaming && editable ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = checklistTitleSchema.safeParse(titleValue);
              if (!parsed.success) {
                setTitleError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
                return;
              }
              setTitleError(null);
              if (parsed.data !== checklist.title) {
                handlers.onRenameChecklist({ checklistId: checklist.id, title: parsed.data });
              }
              setRenaming(false);
            }}
            noValidate
            className="flex-1 space-y-2"
          >
            <Input
              name="checklistTitle"
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              aria-label={copy.renamePlaceholder}
              disabled={pending}
              autoComplete="off"
              aria-invalid={titleError ? true : undefined}
            />
            {titleError && <p className="text-destructive text-sm">{titleError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? copy.renameSaving : copy.renameSave}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setTitleValue(checklist.title);
                  setTitleError(null);
                  setRenaming(false);
                }}
              >
                {copy.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <h4 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              className="flex w-full items-center gap-1.5 rounded text-left text-sm font-medium transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              {collapsed ? (
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 break-words">{checklist.title}</span>
              {collapsed && (
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {done}/{total}
                </span>
              )}
            </button>
          </h4>
        )}
        {canEdit && !renaming && (
          <span className="flex shrink-0 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.listActions}
                  // DEM-248 — dokunmatikte ≥44px dokunma hedefi.
                  className="size-7 touch:size-11"
                >
                  <MoreHorizontalIcon className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!archived && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setTitleValue(checklist.title);
                      setRenaming(true);
                    }}
                  >
                    <PencilIcon className="size-3.5" aria-hidden />
                    {copy.rename}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() =>
                    handlers.onArchiveChecklist({ checklistId: checklist.id, archived: !archived })
                  }
                >
                  {archived ? (
                    <ArchiveRestoreIcon className="size-3.5" aria-hidden />
                  ) : (
                    <ArchiveIcon className="size-3.5" aria-hidden />
                  )}
                  {archived ? copy.unarchive : copy.archive}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2Icon className="size-3.5" aria-hidden />
                  {copy.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                      handlers.onDeleteChecklist(checklist.id);
                      setDeleteOpen(false);
                    }}
                  >
                    {pending ? copy.deleting : copy.deleteConfirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </span>
        )}
      </div>

      {/* body */}
      {!collapsed && (
        <div id={bodyId} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-primary text-[11px] font-semibold tabular-nums">
              {done}/{total}
            </span>
            <Progress
              value={done}
              max={total || 1}
              complete={total > 0 && done === total}
              className="h-1 flex-1"
              aria-label={copy.checklistProgressLabel}
            />
          </div>
          <p className="text-muted-foreground sr-only">
            {done}/{total} {copy.progress} {copy.progressDone}
          </p>

          {tree.length > 0 && (
            <ul className="space-y-1.5">
              {tree.map((node) => (
                <ChecklistItemTreeNode
                  key={node.id}
                  node={node}
                  checklistId={checklist.id}
                  editable={editable}
                  pending={pending}
                  dnd={dnd}
                  handlers={handlers}
                  nameOf={nameOf}
                  imageOf={imageOf}
                  comments={comments}
                  attachments={attachments}
                  selectedItemId={selectedItemId}
                  onSelectItem={onSelectItem}
                />
              ))}
            </ul>
          )}

          {editable && (
            <AddItemForm
              onSubmit={(content) => handlers.onAddItem({ checklistId: checklist.id, content })}
              pending={pending}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * İç içe (nested) bir madde düğümü — kendini alt ağaç için özyineli çağırır
 * (`CHECKLIST_MAX_DEPTH` = 3 seviye). Her düğüm bir {@link ChecklistItemRow}
 * çizer; çocukları soldan girintili bir `<ul>` olarak satırın kendi `<li>`'sine
 * (row `children`) yerleştirir — DOM ağacı domain ağacını yansıtır. "Alt madde
 * ekle" yalnız derinlik sınırı altındaki (kök + çocuk) maddelerde görünür ve
 * seçilince o düğümün altına girintili bir ekleme formu açar. Sürükle-bırak tüm
 * seviyeler için aynı `dnd` örneğiyle çalışır; reorder AYNI seviyeyle sınırlıdır
 * (drag payload `parentItemId` taşır — bkz. `use-checklist-dnd`).
 */
function ChecklistItemTreeNode({
  node,
  checklistId,
  editable,
  pending,
  dnd,
  handlers,
  nameOf,
  imageOf,
  comments,
  attachments,
  selectedItemId,
  onSelectItem,
}: {
  node: ChecklistTreeNode<ChecklistView['items'][number]>;
  checklistId: string;
  editable: boolean;
  pending: boolean;
  dnd: ChecklistDnd;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  comments?: ChecklistCommentContext;
  attachments?: ChecklistAttachmentContext;
  selectedItemId?: string | null;
  onSelectItem: (itemId: string, tab?: ChecklistItemDetailTab) => void;
}) {
  // "Alt madde ekle" formu açık mı — context menüden tetiklenir, ekleme/vazgeç
  // sonrası kapanır.
  const [addingSub, setAddingSub] = useState(false);
  // Derinlik sınırı: torun (depth `CHECKLIST_MAX_DEPTH - 1`) altına eklenemez.
  const canAddSub = editable && node.depth < CHECKLIST_MAX_DEPTH - 1;
  const parentItemId = node.parentItemId ?? null;
  const hasChildren = node.children.length > 0;

  return (
    <ChecklistItemRow
      item={node}
      canEdit={editable}
      pending={pending}
      nameOf={nameOf}
      imageOf={imageOf}
      comments={comments}
      attachments={attachments}
      selected={selectedItemId === node.id}
      onSelect={(tab) => onSelectItem(node.id, tab)}
      canAddSubItem={canAddSub}
      onAddSubItem={() => setAddingSub(true)}
      registerDnd={
        dnd.enabled
          ? (element, dragHandle) =>
              dnd.registerItem({
                element,
                dragHandle,
                itemId: node.id,
                position: node.position,
                parentItemId,
              })
          : undefined
      }
      dragging={dnd.draggingItemId === node.id}
      dropEdge={dnd.dropIndicator?.itemId === node.id ? dnd.dropIndicator.edge : null}
      onToggle={(completed) => handlers.onToggleItem({ checklistId, itemId: node.id, completed })}
      onEdit={(content) => handlers.onEditItem({ checklistId, itemId: node.id, content })}
      onDelete={() => handlers.onDeleteItem({ checklistId, itemId: node.id })}
    >
      {(hasChildren || (addingSub && editable)) && (
        <div className="mt-1.5 ml-2.5 space-y-1.5 border-l border-border/60 pl-2.5">
          {hasChildren && (
            <ul className="space-y-1.5">
              {node.children.map((child) => (
                <ChecklistItemTreeNode
                  key={child.id}
                  node={child}
                  checklistId={checklistId}
                  editable={editable}
                  pending={pending}
                  dnd={dnd}
                  handlers={handlers}
                  nameOf={nameOf}
                  imageOf={imageOf}
                  comments={comments}
                  attachments={attachments}
                  selectedItemId={selectedItemId}
                  onSelectItem={onSelectItem}
                />
              ))}
            </ul>
          )}
          {addingSub && editable && (
            <AddItemForm
              startOpen
              placeholder={strings.card.checklist.itemSubPlaceholder}
              onClose={() => setAddingSub(false)}
              onSubmit={(content) =>
                handlers.onAddItem({ checklistId, content, parentItemId: node.id })
              }
              pending={pending}
            />
          )}
        </div>
      )}
    </ChecklistItemRow>
  );
}
