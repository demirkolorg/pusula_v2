'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
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
  Trash2Icon,
} from 'lucide-react';
import { LIST_COLORS, listTitleSchema, type ListColor } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
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
  applyListRemove,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { readListCollapsed, writeListCollapsed } from './list-collapse-storage';
import { useTRPC } from '@/trpc/client';
import { ListReportsSubmenu } from '@/components/reports/entity-tab/list-reports-submenu';
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
  /**
   * Faz 13G (DEM-263) — parent route'tan (`workspaces/[id]/...`) gelen
   * workspaceId; `ListReportsSubmenu`'nun composer scope'unu kurması
   * için. Optional: testler vermez → menu item gizlenir.
   */
  workspaceId?: string;
  list: BoardList;
  cards: BoardCard[];
  /**
   * Whether the viewer may edit content on this board (board `member+` and the
   * board itself is active). An archived *list* is still read-only even when
   * this is true — handled below.
   */
  canEdit: boolean;
  /**
   * Whether the viewer is a board admin (or workspace owner/admin) on an
   * active board. Faz 17 — gates `list.delete` / `card.delete` (hard delete
   * is admin+ only); UI hides the menu items when false. Default `false`.
   */
  isBoardAdmin?: boolean;
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
      className="border-primary/60 bg-primary/5 box-border shrink-0 rounded-md border border-dashed transition-[opacity] duration-(--duration-fast) ease-out"
      style={{ height: height ?? 64 }}
    />
  );
}

const LIST_COLOR_SET = new Set<string>(LIST_COLORS);

const LIST_COLUMN_BG: Record<ListColor, string> = {
  yesil: '[--board-list-current-bg:var(--board-list-color-yesil-bg)]',
  sari: '[--board-list-current-bg:var(--board-list-color-sari-bg)]',
  turuncu: '[--board-list-current-bg:var(--board-list-color-turuncu-bg)]',
  kirmizi: '[--board-list-current-bg:var(--board-list-color-kirmizi-bg)]',
  mor: '[--board-list-current-bg:var(--board-list-color-mor-bg)]',
  mavi: '[--board-list-current-bg:var(--board-list-color-mavi-bg)]',
  sky: '[--board-list-current-bg:var(--board-list-color-sky-bg)]',
  lime: '[--board-list-current-bg:var(--board-list-color-lime-bg)]',
  pembe: '[--board-list-current-bg:var(--board-list-color-pembe-bg)]',
  gri: '[--board-list-current-bg:var(--board-list-color-gri-bg)]',
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
 * The list-header menu (rename / colour / icon / move / archive) is offered
 * two ways — the header's ⋮ button (a dropdown) and a right-click on the header
 * (a context menu). Both share one set of menu items via `renderListMenu`; the
 * caller passes the matching primitive set so the items render under whichever
 * menu opened them.
 */
type ListMenuKit = {
  Item: React.ElementType;
  Separator: React.ElementType;
  Sub: React.ElementType;
  SubTrigger: React.ElementType;
  SubContent: React.ElementType;
};

const DROPDOWN_MENU_KIT: ListMenuKit = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

const CONTEXT_MENU_KIT: ListMenuKit = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

/**
 * Fixed-width board column for a single list: a header (drag handle + title +
 * a "⋮" menu — rename / archive / restore, and — when there's a neighbour that
 * way — "move left / right"), the cards (each draggable), and
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
  workspaceId,
  list,
  cards,
  canEdit,
  isBoardAdmin = false,
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  // Daralt/genişlet tercihi list.id bazında localStorage'de saklanır; lazy init
  // ile sayfa yenilendiğinde daraltılmış liste daraltılmış açılır (aşağıdaki effect).
  const [collapsed, setCollapsed] = useState(() => readListCollapsed(list.id));
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
  // Daralt/genişlet tercihini kalıcı kıl (salt client-side; domain/realtime etkisi yok).
  useEffect(() => {
    writeListCollapsed(list.id, collapsed);
  }, [list.id, collapsed]);
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

  // Faz 17 (2026-06-01) — liste kalıcı silme. Backend yalnızca boş listede
  // çalışır (içeride kart varsa BAD_REQUEST döner); UI menü item'ında
  // disabled + tooltip uyarısı verir, optimistic cache `applyListRemove` ile
  // listeyi düşürür. Geri alınamaz; arşivlemeden ayrı bir aksiyon.
  const deleteList = useOptimisticBoardMutation({
    mutationOptions: trpc.list.delete.mutationOptions,
    boardId,
    apply: (data, vars) => applyListRemove(data, vars.listId),
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
    onMutationSuccess: () => setDeleteOpen(false),
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
  // `useMemo`'lu — her render'da `[...allLists].sort()` yeni dizi üretmesin
  // (DEM-226 #2).
  const orderedListIds = useMemo(
    () =>
      [...allLists]
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
        .map((l) => l.id),
    [allLists],
  );
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
            // DEM-248 — dokunmatikte ≥44px dokunma hedefi (liste daralt/genişlet).
            className={cn('size-7 shrink-0 touch:size-11', className)}
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

  // Shared menu items for both the ⋮ dropdown and the header context menu.
  const renderListMenu = ({ Item, Separator, Sub, SubTrigger, SubContent }: ListMenuKit) => (
    <>
      {!listArchived && (
        <>
          <Item onSelect={startRenaming}>
            <PencilIcon />
            {columnCopy.menuRename}
          </Item>
          <Sub>
            <SubTrigger>
              <PaletteIcon />
              {strings.board.list.colorPicker.title}
            </SubTrigger>
            <SubContent className="p-2">
              <ListColorPicker boardId={boardId} listId={list.id} value={listColor} />
            </SubContent>
          </Sub>
          <Sub>
            <SubTrigger>
              <StarIcon />
              {strings.board.list.iconPicker.title}
            </SubTrigger>
            <SubContent className="p-2">
              <ListIconPicker
                boardId={boardId}
                listId={list.id}
                value={listIcon}
                color={listIconColor}
              />
            </SubContent>
          </Sub>
        </>
      )}
      {(canMoveLeft || canMoveRight) && (
        <>
          <Separator />
          {canMoveLeft && (
            <Item onSelect={() => dnd?.moveColumnByOne(list.id, 'left')}>
              <ArrowLeftIcon />
              {dndCopy.moveLeft}
            </Item>
          )}
          {canMoveRight && (
            <Item onSelect={() => dnd?.moveColumnByOne(list.id, 'right')}>
              <ArrowRightIcon />
              {dndCopy.moveRight}
            </Item>
          )}
          <Separator />
        </>
      )}
      {/* Faz 13G (DEM-263) — list scope rapor composer'ı açar.
          workspaceId yoksa item gizlenir; archive'dan önceki tek Separator
          burada yer alır (ardışık ayraç UX regression'ı code-review H2). */}
      {!listArchived && workspaceId ? (
        <>
          <Separator />
          <ListReportsSubmenu
            listId={list.id}
            boardId={boardId}
            workspaceId={workspaceId}
            Item={Item}
          />
          <Separator />
        </>
      ) : (
        <Separator />
      )}
      <Item onSelect={() => setArchiveOpen(true)}>
        {listArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        {listArchived ? columnCopy.menuRestore : columnCopy.menuArchive}
      </Item>
      {isBoardAdmin && (
        <Item
          variant="destructive"
          disabled={cards.length > 0}
          onSelect={() => {
            if (cards.length > 0) return;
            setDeleteOpen(true);
          }}
          title={cards.length > 0 ? columnCopy.deleteDisabledNotEmpty : undefined}
        >
          <Trash2Icon />
          {columnCopy.menuDelete}
        </Item>
      )}
    </>
  );

  // The expanded (non-collapsed) header. Rendered as-is when the list is
  // read-only or being renamed; wrapped in a context menu otherwise (below).
  const expandedHeader = (
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
            className="h-7 border-0 bg-muted/40 px-1.5 text-[15px] font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
              <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
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
              <h2 className="truncate text-[15px] font-semibold">{list.title}</h2>
            )}
          </div>
          {renderCollapseToggle()}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  // DEM-248 — dokunmatikte ≥44px dokunma hedefi (kolon menü tetiği).
                  className="size-7 shrink-0 touch:size-11"
                  aria-label={columnCopy.more}
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {renderListMenu(DROPDOWN_MENU_KIT)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </header>
  );

  return (
    <section
      ref={columnRef}
      className={cn(
        'group/list relative flex max-h-full shrink-0 flex-col rounded-lg bg-[color:var(--board-list-current-bg)] transition-[opacity,width] duration-(--duration-slow) ease-standard',
        collapsed ? 'h-52 w-10 overflow-hidden' : 'w-72',
        listArchived
          ? '[--board-list-current-bg:var(--board-list-archived-bg)]'
          : listColor && LIST_COLUMN_BG[listColor],
        columnDragging && 'opacity-0',
      )}
      data-dragging={columnDragging ? '' : undefined}
      data-collapsed={collapsed ? '' : undefined}
      aria-label={list.title}
    >
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
            <span className="min-h-0 flex-1 truncate text-[15px] font-semibold [writing-mode:vertical-rl]">
              {list.title}
            </span>
          </div>
        </header>
      ) : canEdit && !renaming ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{expandedHeader}</ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            {renderListMenu(CONTEXT_MENU_KIT)}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        expandedHeader
      )}

      {!collapsed && (
        <div
          id={cardsAreaId}
          ref={cardsAreaRef}
          className="pusula-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-y-contain px-2 pt-1 pb-2"
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
                    isBoardAdmin={isBoardAdmin}
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
            <div className="rounded-md bg-[color:var(--board-card-bg)] p-2 shadow-sm">
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
                'text-muted-foreground pointer-events-none h-8 w-full justify-start opacity-0 hover:bg-[color:var(--board-list-bg-hover)] hover:text-card-foreground group-hover/list:pointer-events-auto group-hover/list:opacity-100 group-focus-within/list:pointer-events-auto group-focus-within/list:opacity-100',
                // DEM-248 — dokunmatikte hover yok; "kart ekle" her zaman görünür/dokunulur.
                'touch:pointer-events-auto touch:opacity-100',
              )}
            >
              <PlusIcon className="size-4" />
              {cardCopy.addCard}
            </Button>
          )}
        </footer>
      )}

      {isBoardAdmin && (
        <Dialog
          open={deleteOpen}
          onOpenChange={(next) => {
            if (deleteList.isPending) return;
            setDeleteOpen(next);
            if (!next) deleteList.reset();
          }}
        >
          <DialogContent closeLabel={strings.common.close}>
            <DialogHeader>
              <DialogTitle>{columnCopy.deleteConfirmTitle}</DialogTitle>
              <DialogDescription>{columnCopy.deleteConfirmDescription}</DialogDescription>
            </DialogHeader>
            {deleteList.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {getMutationErrorMessage(deleteList) ?? strings.common.unknownError}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={deleteList.isPending}>
                  {strings.common.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteList.isPending}
                onClick={() =>
                  deleteList.mutate({
                    boardId,
                    listId: list.id,
                  })
                }
              >
                {deleteList.isPending ? columnCopy.deleting : columnCopy.deleteConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
