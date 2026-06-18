'use client';

import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { checklistTitleSchema } from '@pusula/domain';
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
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddItemForm } from './checklist-add-forms';
import { ChecklistItemRow } from './checklist-item-row';
import { useChecklistDnd } from './use-checklist-dnd';
import type {
  ChecklistCommentContext,
  ChecklistHandlers,
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
  pending,
  handlers,
  nameOf,
  imageOf,
  comments,
}: {
  checklist: ChecklistView;
  canEdit: boolean;
  pending: boolean;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  /** Per-item comment-thread context — forwarded to each row's toggle. */
  comments?: ChecklistCommentContext;
}) {
  const copy = strings.card.checklist;
  const [renaming, setRenaming] = useState(false);
  const [titleValue, setTitleValue] = useState(checklist.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Bölümü başlığa tıklayarak aç/kapa — çok sayıda checklist varken üzerinde
  // çalışılana odaklanmayı kolaylaştırır. Bileşen-içi durum (kart kapanınca
  // sıfırlanır); kapalıyken gövde (ilerleme + maddeler + ekleme formu) gizlenir.
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = `checklist-body-${checklist.id}`;

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.completed).length;

  // Madde sürükle-bırak sıralaması (DEM — web). Yalnız düzenlenebilir + birden
  // fazla madde varken anlamlı; drop'ta tek `onReorderItem` çağrısı (optimistic
  // patch + mutation dialog'da). Salt-okur/arşiv → enabled false → handle yok.
  const dnd = useChecklistDnd({
    checklistId: checklist.id,
    items: checklist.items,
    enabled: canEdit && checklist.items.length > 1,
    onReorder: (args) => handlers.onReorderItem(args),
  });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        {renaming && canEdit ? (
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
                <DropdownMenuItem
                  onSelect={() => {
                    setTitleValue(checklist.title);
                    setRenaming(true);
                  }}
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                  {copy.rename}
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

          {checklist.items.length > 0 && (
            <ul className="space-y-1.5">
              {checklist.items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  pending={pending}
                  nameOf={nameOf}
                  imageOf={imageOf}
                  comments={comments}
                  registerDnd={
                    dnd.enabled
                      ? (element, dragHandle) =>
                          dnd.registerItem({
                            element,
                            dragHandle,
                            itemId: item.id,
                            position: item.position,
                          })
                      : undefined
                  }
                  dragging={dnd.draggingItemId === item.id}
                  dropEdge={dnd.dropIndicator?.itemId === item.id ? dnd.dropIndicator.edge : null}
                  onToggle={(completed) =>
                    handlers.onToggleItem({ checklistId: checklist.id, itemId: item.id, completed })
                  }
                  onEdit={(content) =>
                    handlers.onEditItem({ checklistId: checklist.id, itemId: item.id, content })
                  }
                  onDelete={() =>
                    handlers.onDeleteItem({ checklistId: checklist.id, itemId: item.id })
                  }
                />
              ))}
            </ul>
          )}

          {canEdit && (
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
