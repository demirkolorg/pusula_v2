'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PanelLeftCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
} from 'lucide-react';
import { LIST_COLORS, listTitleSchema, type ListColor } from '@pusula/domain';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import {
  applyListArchive,
  applyListPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AddCardForm } from './add-card-form';
import { useBoardDndContext } from './board-dnd-context';
import {
  CardItem,
  type BoardCard,
  type BoardCardLabelOption,
  type BoardCardMemberOption,
} from './card-item';
import { ListColorPicker } from './list-color-picker';
import {
  LIST_ICON_COMPONENTS,
  LIST_ICON_FG,
  asListIcon,
  asListIconColor,
} from './list-icon-presentation';
import { ListIconPicker } from './list-icon-picker';
import type { CardDropPlaceholder } from './use-board-dnd';

export type BoardList = {
  id: string;
  title: string;
  position: string;
  color: string | null;
  icon: string | null;
  iconColor: string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ListColumnProps = {
  boardId: string;
  list: BoardList;
  cards: BoardCard[];
  /**
   * Whether the viewer may edit content on this board (board `member+` and the
   * board itself is active). An archived *list* is still read-only even when
   * this is true — handled below.
   */
  canEdit: boolean;
  /**
   * All of the board's lists (active + archived), `position`-sorted — used by
   * the column's ⋮ "move left / right" actions and by each card's ⋮ "move to
   * list" picker. Optional so a `ListColumn` rendered in isolation still works.
   */
  allLists?: BoardList[];
  /** Board label palette used by each card's context menu. */
  boardLabels?: BoardCardLabelOption[];
  /** Board members used by each card's context menu. */
  boardMembers?: BoardCardMemberOption[];
  openAddCardComposerToken?: number;
};

function CardDropPlaceholderMarker({ height }: { height: number | null }) {
  return (
    <div
      aria-hidden
      data-testid="card-drop-placeholder"
      className="border-primary/60 bg-primary/5 box-border shrink-0 rounded-md border border-dashed"
      style={{ height: height ?? 64 }}
    />
  );
}

const LIST_COLOR_SET = new Set<string>(LIST_COLORS);

const LIST_ACCENT_BG: Record<ListColor, string> = {
  yesil: 'bg-palet-yesil',
  sari: 'bg-palet-sari',
  turuncu: 'bg-palet-turuncu',
  kirmizi: 'bg-palet-kirmizi',
  mor: 'bg-palet-mor',
  mavi: 'bg-palet-mavi',
  sky: 'bg-palet-sky',
  lime: 'bg-palet-lime',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
};

const LIST_ACCENT_FG: Record<ListColor, string> = {
  yesil: 'text-palet-yesil',
  sari: 'text-palet-sari',
  turuncu: 'text-palet-turuncu',
  kirmizi: 'text-palet-kirmizi',
  mor: 'text-palet-mor',
  mavi: 'text-palet-mavi',
  sky: 'text-palet-sky',
  lime: 'text-palet-lime',
  pembe: 'text-palet-pembe',
  gri: 'text-palet-gri',
};

function asListColor(color: string | null): ListColor | null {
  return color != null && LIST_COLOR_SET.has(color) ? (color as ListColor) : null;
}

/**
 * Fixed-width board column for a single list: a header (drag handle + title +
 * card count + a "⋮" menu — rename / archive / restore, and — when there's a
 * neighbour that way — "move left / right"), the cards (each draggable), and
 * (when editable) an add-card form. Within the board's drag-and-drop context
 * (Phase 3B — DEM-43) the column is draggable by its header handle and is both
 * a column-shaped drop target (left/right edge → reorder) and — via its cards
 * area — a "drop a card at the end" target; archived lists are never drop
 * targets (the server gate is authoritative; the UI just disables it). The "⋮"
 * menu actions reuse the existing mutations (`list.update` / `list.archive` /
 * `list.move`); archiving still goes through a confirm dialog.
 */
export function ListColumn({
  boardId,
  list,
  cards,
  canEdit,
  allLists = [],
  boardLabels = [],
  boardMembers = [],
  openAddCardComposerToken = 0,
}: ListColumnProps) {
  const trpc = useTRPC();
  const renameId = useId();
  const cardsAreaId = useId();
  const columnCopy = strings.board.column;
  const cardCopy = strings.board.card;
  const dndCopy = strings.board.dnd;
  const dnd = useBoardDndContext();

  const listArchived = list.archivedAt != null;
  const listColor = asListColor(list.color);
  const listIcon = asListIcon(list.icon);
  const listIconColor = asListIconColor(list.iconColor);
  const ListHeaderIcon = listIcon ? LIST_ICON_COMPONENTS[listIcon] : null;
  // An archived list never accepts mutations, even if the viewer could otherwise edit.
  const listEditable = canEdit && !listArchived;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const skipRenameCommitRef = useRef(false);

  // --- Drag-and-drop wiring ------------------------------------------------
  const columnRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const cardsAreaRef = useRef<HTMLDivElement | null>(null);
  const [columnDragging, setColumnDragging] = useState(false);

  // The column is only draggable / a column drop target when the list is active
  // (you can drag an archived list around? no — it's read-only) and DnD is on.
  useEffect(() => {
    if (!dnd || listArchived || renaming) return;
    const el = columnRef.current;
    const handle = handleRef.current;
    if (!el || !handle) return;
    return dnd.registerColumn({
      element: el,
      dragHandle: handle,
      listId: list.id,
      position: list.position,
      onDraggingChange: setColumnDragging,
    });
  }, [dnd, list.id, list.position, listArchived, renaming, collapsed]);

  // The cards area is a "drop a card at the end of this list" target (active lists only).
  useEffect(() => {
    if (!dnd || listArchived || collapsed) return;
    const el = cardsAreaRef.current;
    if (!el) return;
    return dnd.registerListCardsArea({
      element: el,
      listId: list.id,
    });
  }, [dnd, list.id, listArchived, collapsed]);

  useEffect(() => setRenameValue(list.title), [list.title]);
  useEffect(() => {
    if (collapsed) setAddingCard(false);
  }, [collapsed]);
  useEffect(() => {
    if (!listEditable || openAddCardComposerToken <= 0) return;
    setAddingCard(true);
  }, [listEditable, openAddCardComposerToken]);

  const renameList = useOptimisticBoardMutation({
    mutationOptions: trpc.list.update.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.title == null ? data : applyListPatch(data, vars.listId, { title: vars.title }),
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
    onMutationSuccess: () => setRenaming(false),
  });

  const archiveList = useOptimisticBoardMutation({
    mutationOptions: trpc.list.archive.mutationOptions,
    boardId,
    apply: (data, vars) => applyListArchive(data, vars.listId, vars.archived ? new Date() : null),
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
    onMutationSuccess: () => setArchiveOpen(false),
  });

  const createCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.create.mutationOptions,
    boardId,
    apply: (data) => data,
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
  });

  // Whether there's a neighbouring list to move to in each direction (uses the
  // full position-sorted list set, so it's correct even with archived lists
  // hidden). Only meaningful within the DnD context (board `member+`, active).
  const orderedListIds = [...allLists]
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    .map((l) => l.id);
  const indexInBoard = orderedListIds.indexOf(list.id);
  const canMoveLeft = !!dnd && listEditable && indexInBoard > 0;
  const canMoveRight =
    !!dnd && listEditable && indexInBoard !== -1 && indexInBoard < orderedListIds.length - 1;
  const cardPlaceholder: CardDropPlaceholder | null =
    dnd?.cardPlaceholder?.listId === list.id ? dnd.cardPlaceholder : null;

  const startRenaming = () => {
    skipRenameCommitRef.current = false;
    setRenameValue(list.title);
    setRenameError(null);
    renameList.reset();
    setRenaming(true);
  };

  const cancelRenaming = () => {
    skipRenameCommitRef.current = true;
    setRenameValue(list.title);
    setRenameError(null);
    renameList.reset();
    setRenaming(false);
  };

  const commitRename = () => {
    if (skipRenameCommitRef.current) {
      skipRenameCommitRef.current = false;
      return;
    }
    if (renameList.isPending) return;
    const parsed = listTitleSchema.safeParse(renameValue);
    if (!parsed.success) {
      setRenameError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setRenameError(null);
    if (parsed.data === list.title) {
      setRenaming(false);
      return;
    }
    renameList.mutate({
      boardId,
      listId: list.id,
      title: parsed.data,
    });
  };

  const handleRenameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitRename();
  };

  const handleArchiveOpenChange = (next: boolean) => {
    if (archiveList.isPending) return;
    setArchiveOpen(next);
    if (!next) archiveList.reset();
  };

  const renderCollapseToggle = (className?: string) => {
    const ToggleIcon = collapsed ? PanelRightOpenIcon : PanelLeftCloseIcon;
    const label = collapsed ? columnCopy.expand : columnCopy.collapse;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-7 shrink-0', className)}
            aria-label={label}
            aria-expanded={!collapsed}
            aria-controls={cardsAreaId}
            onClick={() => setCollapsed((current) => !current)}
          >
            <ToggleIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <section
      ref={columnRef}
      className={cn(
        'relative flex max-h-full shrink-0 flex-col rounded-lg border border-[color:var(--board-list-border)] transition-[opacity,width]',
        collapsed ? 'h-52 w-10 overflow-hidden' : 'w-72',
        listArchived && 'border-dashed',
        listArchived
          ? 'bg-[color:var(--board-list-archived-bg)]'
          : 'bg-[color:var(--board-list-bg)]',
        columnDragging && 'opacity-0',
      )}
      data-dragging={columnDragging ? '' : undefined}
      data-collapsed={collapsed ? '' : undefined}
      aria-label={list.title}
    >
      {listColor && (
        <div
          data-list-accent
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-lg',
            LIST_ACCENT_BG[listColor],
          )}
        />
      )}

      {collapsed ? (
        <header className="text-card-foreground flex h-full min-h-0 shrink-0 flex-col items-center gap-2 p-1.5">
          {renderCollapseToggle()}
          <div
            ref={dnd && !listArchived ? handleRef : undefined}
            className={cn(
              'flex min-h-0 flex-1 flex-col items-center gap-2 rounded-sm px-1 py-1',
              dnd && !listArchived && !renaming && 'cursor-grab active:cursor-grabbing',
            )}
            aria-label={dnd && !listArchived ? dndCopy.listDragHandleLabel : undefined}
          >
            {listArchived && (
              <ArchiveIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            )}
            {ListHeaderIcon && listIcon && (
              <ListHeaderIcon
                data-testid={`list-icon-${listIcon}`}
                className={cn(
                  'size-3.5 shrink-0',
                  listIconColor
                    ? LIST_ICON_FG[listIconColor]
                    : listColor === null
                      ? 'text-muted-foreground'
                      : LIST_ACCENT_FG[listColor],
                )}
                aria-hidden
              />
            )}
            <span className="min-h-0 flex-1 truncate text-sm font-semibold [writing-mode:vertical-rl]">
              {list.title}
            </span>
            <span className="text-muted-foreground shrink-0 text-[11px] leading-none [writing-mode:vertical-rl]">
              {cards.length} {columnCopy.cardCount}
            </span>
          </div>
        </header>
      ) : (
        <header className="text-card-foreground flex shrink-0 items-center justify-between gap-1 p-2">
          {renaming ? (
            <form onSubmit={handleRenameSubmit} noValidate className="w-full space-y-2">
              <Input
                id={renameId}
                name="listTitle"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRenaming();
                  }
                }}
                placeholder={columnCopy.renamePlaceholder}
                aria-label={columnCopy.renamePlaceholder}
                disabled={renameList.isPending}
                autoComplete="off"
                autoFocus
                className="h-7 border-0 bg-muted/40 px-1.5 text-sm font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-invalid={renameError || renameList.isError ? true : undefined}
                aria-describedby={renameError ? `${renameId}-error` : undefined}
              />
              {renameError && (
                <p id={`${renameId}-error`} className="text-destructive text-sm">
                  {renameError}
                </p>
              )}
              {!renameError && renameList.isError && (
                <p className="text-destructive text-sm">
                  {getMutationErrorMessage(renameList) ?? strings.common.unknownError}
                </p>
              )}
            </form>
          ) : (
            <>
              <div
                ref={dnd && !listArchived ? handleRef : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1 rounded-sm',
                  dnd && !listArchived && !renaming && 'cursor-grab active:cursor-grabbing',
                )}
                aria-label={dnd && !listArchived ? dndCopy.listDragHandleLabel : undefined}
              >
                {listArchived && (
                  <ArchiveIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                )}
                {ListHeaderIcon && listIcon && (
                  <ListHeaderIcon
                    data-testid={`list-icon-${listIcon}`}
                    className={cn(
                      'size-3.5 shrink-0',
                      listIconColor
                        ? LIST_ICON_FG[listIconColor]
                        : listColor === null
                          ? 'text-muted-foreground'
                          : LIST_ACCENT_FG[listColor],
                    )}
                    aria-hidden
                  />
                )}
                {listEditable ? (
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <button
                      type="button"
                      className={cn(
                        'block min-w-0 max-w-full truncate rounded-sm text-left outline-none hover:bg-[color:var(--board-list-bg-hover)] focus-visible:ring-2 focus-visible:ring-ring/60',
                      )}
                      onClick={startRenaming}
                    >
                      {list.title}
                    </button>
                  </h2>
                ) : (
                  <h2 className="truncate text-sm font-semibold">{list.title}</h2>
                )}
                <span className="text-muted-foreground shrink-0 text-xs">
                  {cards.length} {columnCopy.cardCount}
                </span>
              </div>
              {renderCollapseToggle()}
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={columnCopy.more}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!listArchived && (
                      <>
                        <DropdownMenuItem onSelect={startRenaming}>
                          <PencilIcon />
                          {columnCopy.menuRename}
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <PaletteIcon />
                            {strings.board.list.colorPicker.title}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="p-2">
                            <ListColorPicker boardId={boardId} listId={list.id} value={listColor} />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <StarIcon />
                            {strings.board.list.iconPicker.title}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="p-2">
                            <ListIconPicker
                              boardId={boardId}
                              listId={list.id}
                              value={listIcon}
                              color={listIconColor}
                            />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                    {(canMoveLeft || canMoveRight) && (
                      <>
                        <DropdownMenuSeparator />
                        {canMoveLeft && (
                          <DropdownMenuItem onSelect={() => dnd?.moveColumnByOne(list.id, 'left')}>
                            <ArrowLeftIcon />
                            {dndCopy.moveLeft}
                          </DropdownMenuItem>
                        )}
                        {canMoveRight && (
                          <DropdownMenuItem onSelect={() => dnd?.moveColumnByOne(list.id, 'right')}>
                            <ArrowRightIcon />
                            {dndCopy.moveRight}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                      {listArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                      {listArchived ? columnCopy.menuRestore : columnCopy.menuArchive}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </header>
      )}

      {!collapsed && (
        <div
          id={cardsAreaId}
          ref={cardsAreaRef}
          className="pusula-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2"
        >
          {cards.length === 0 && !listEditable ? (
            <p className="text-muted-foreground px-1 py-2 text-sm">{columnCopy.empty}</p>
          ) : (
            <>
              {cards.map((card) => (
                <Fragment key={card.id}>
                  {cardPlaceholder?.targetCardId === card.id && cardPlaceholder.edge === 'top' && (
                    <CardDropPlaceholderMarker height={cardPlaceholder.height} />
                  )}
                  <CardItem
                    boardId={boardId}
                    card={card}
                    canEdit={listEditable && card.archivedAt == null}
                    allLists={allLists}
                    boardLabels={boardLabels}
                    boardMembers={boardMembers}
                  />
                  {cardPlaceholder?.targetCardId === card.id &&
                    cardPlaceholder.edge === 'bottom' && (
                      <CardDropPlaceholderMarker height={cardPlaceholder.height} />
                    )}
                </Fragment>
              ))}
              {cardPlaceholder && cardPlaceholder.targetCardId == null && (
                <CardDropPlaceholderMarker height={cardPlaceholder.height} />
              )}
            </>
          )}
        </div>
      )}

      {!collapsed && listEditable && (
        <footer className="shrink-0 p-2">
          {addingCard ? (
            <div className="rounded-md bg-card p-2 shadow-sm">
              <AddCardForm
                variant="compact"
                onSubmit={(title) =>
                  createCard.mutate({
                    listId: list.id,
                    title,
                  })
                }
                onSubmitted={() => setAddingCard(false)}
                onCancel={() => setAddingCard(false)}
                pending={createCard.isPending}
                error={
                  createCard.isError
                    ? (getMutationErrorMessage(createCard) ?? strings.common.unknownError)
                    : null
                }
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddingCard(true)}
              className={cn(
                'text-muted-foreground h-8 w-full justify-start hover:bg-[color:var(--board-list-bg-hover)] hover:text-card-foreground',
              )}
            >
              <PlusIcon className="size-4" />
              {cardCopy.addCard}
            </Button>
          )}
        </footer>
      )}

      {canEdit && (
        <Dialog open={archiveOpen} onOpenChange={handleArchiveOpenChange}>
          <DialogContent closeLabel={strings.common.close}>
            <DialogHeader>
              <DialogTitle>
                {listArchived ? columnCopy.restore : columnCopy.archiveConfirmTitle}
              </DialogTitle>
              <DialogDescription>
                {listArchived ? list.title : columnCopy.archiveConfirmDescription}
              </DialogDescription>
            </DialogHeader>
            {archiveList.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {getMutationErrorMessage(archiveList) ?? strings.common.unknownError}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={archiveList.isPending}>
                  {strings.common.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant={listArchived ? 'default' : 'destructive'}
                disabled={archiveList.isPending}
                onClick={() =>
                  archiveList.mutate({
                    boardId,
                    listId: list.id,
                    archived: !listArchived,
                  })
                }
              >
                {archiveList.isPending
                  ? listArchived
                    ? columnCopy.restoring
                    : columnCopy.archiving
                  : listArchived
                    ? columnCopy.restore
                    : columnCopy.archiveConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
