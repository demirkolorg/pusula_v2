'use client';

import { useState } from 'react';
import { FilterIcon, Share2Icon, UserCheckIcon } from 'lucide-react';
import { DEFAULT_BOARD_ICON, ENTITY_ICONS, type EntityIcon } from '@pusula/domain';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { EntityIconGlyph } from '@/components/entity-icon';
import { strings } from '@/lib/strings';
import { ArchiveBoardDialog, useRestoreBoard } from './archive-board-dialog';
import { BoardActivityDropdown } from './board-activity-dropdown';
import { ArchivedItemsDropdown, type BoardArchiveList } from './archived-items-dropdown';
import { BoardFilterMenuContent, type BoardFilterMenuContentProps } from './board-filter-bar';
import { BoardIconPicker } from './board-settings/board-icon-picker';
import { BoardLabelsDropdown } from './board-settings/board-labels-dropdown';
import { BoardMembersDropdown } from './board-settings/board-members-dropdown';
import {
  BoardSettingsDropdown,
  type BoardSettingsTab,
} from './board-settings/board-settings-dropdown';
import { RenameBoardForm } from './rename-board-form';
import { SearchDialog } from '../../../../../_components/search-dialog';

type BoardTopBarProps = {
  boardId: string;
  workspaceId: string;
  title: string;
  icon?: EntityIcon | string;
  background: string | null;
  archived: boolean;
  isBoardAdmin: boolean;
  boardSearchOpen?: boolean;
  onBoardSearchOpenChange?: (open: boolean) => void;
  filter?: BoardFilterMenuContentProps;
  /**
   * "Assigned to me" quick toggle: when `active`, the board only shows cards the
   * viewer is an assignee on. A viewer-scoped filter, separate from the shared
   * label/due-date filter menu. Omitted when the viewer's identity is unknown.
   */
  assignedToMe?: { active: boolean; onToggle: () => void };
  archive?: {
    lists: BoardArchiveList[];
    canEdit: boolean;
    showArchivedLists: boolean;
    onToggleArchivedLists: () => void;
    showArchivedCards: boolean;
    onToggleArchivedCards: () => void;
    archivedListCount: number;
  };
};

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

/**
 * Board icon button left of the title. Shows the board's own icon and opens a
 * focused dropdown to change just that icon — no view switching here.
 */
function BoardIconMenu({
  boardId,
  workspaceId,
  icon,
  canManage,
  boardActive,
}: {
  boardId: string;
  workspaceId: string;
  icon: EntityIcon;
  canManage: boolean;
  boardActive: boolean;
}) {
  const copy = strings.board.settings;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-8 shrink-0', boardChromeButtonClass)}
              aria-label={copy.iconTitle}
            >
              <EntityIconGlyph icon={icon} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{copy.iconTitle}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-[min(28rem,calc(100vw-2rem))] space-y-3 p-3">
        <div className="space-y-1">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            {copy.iconTitle}
          </DropdownMenuLabel>
          <p className="text-muted-foreground text-xs">{copy.iconDescription}</p>
        </div>
        <BoardIconPicker
          boardId={boardId}
          workspaceId={workspaceId}
          icon={icon}
          canManage={canManage}
          boardActive={boardActive}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BoardFilterMenu({ filter }: { filter: BoardFilterMenuContentProps }) {
  const copy = strings.board.filter;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-8', boardChromeButtonClass)}
              aria-label={copy.labelsTitle}
            >
              <FilterIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{copy.labelsTitle}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <BoardFilterMenuContent {...filter} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Assigned to me" quick toggle — a single chrome icon button (no dropdown).
 * `aria-pressed` exposes its on/off state to assistive tech; when active the
 * button keeps the open-state highlight so the filter is visibly engaged.
 */
function AssignedToMeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const copy = strings.board.topBar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={active}
          aria-label={copy.assignedToMe}
          onClick={onToggle}
          className={cn('size-8', boardChromeButtonClass, active && 'bg-white/15')}
        >
          <UserCheckIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copy.assignedToMe}</TooltipContent>
    </Tooltip>
  );
}

export function BoardTopBar({
  boardId,
  workspaceId,
  title,
  icon = DEFAULT_BOARD_ICON,
  background,
  archived,
  isBoardAdmin,
  boardSearchOpen,
  onBoardSearchOpenChange,
  filter,
  assignedToMe,
  archive,
}: BoardTopBarProps) {
  const copy = strings.board.topBar;
  const currentIcon = ENTITY_ICONS.includes(icon as EntityIcon)
    ? (icon as EntityIcon)
    : DEFAULT_BOARD_ICON;

  const [renaming, setRenaming] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<BoardSettingsTab>('background');
  const restoreBoard = useRestoreBoard(boardId);

  const startRenamingFromMenu = () => {
    window.setTimeout(() => setRenaming(true), 0);
  };

  const copyBoardLink = async () => {
    const boardUrl = `${window.location.origin}/workspaces/${workspaceId}/boards/${boardId}`;

    try {
      if (!window.navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await window.navigator.clipboard.writeText(boardUrl);
      toast(copy.shareCopied);
    } catch {
      toast.error(copy.shareFailed);
    }
  };

  return (
    <header className="flex min-h-14 items-center gap-2 bg-board-topbar px-4 py-2 text-[color:var(--board-chrome-fg)]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BoardIconMenu
          boardId={boardId}
          workspaceId={workspaceId}
          icon={currentIcon}
          canManage={isBoardAdmin}
          boardActive={!archived}
        />
        {isBoardAdmin && !archived ? (
          <RenameBoardForm
            boardId={boardId}
            title={title}
            editing={renaming}
            onEditingChange={setRenaming}
            hideTrigger
          />
        ) : (
          <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
        )}
        {archived && <Badge variant="outline">{copy.archivedBadge}</Badge>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {assignedToMe && (
          <AssignedToMeToggle active={assignedToMe.active} onToggle={assignedToMe.onToggle} />
        )}
        {filter && <BoardFilterMenu filter={filter} />}
        {archive && <ArchivedItemsDropdown boardId={boardId} {...archive} />}
        <SearchDialog
          variant="board"
          workspaceId={workspaceId}
          boardId={boardId}
          triggerMode="icon"
          triggerLabel={copy.search}
          triggerClassName={boardChromeButtonClass}
          open={boardSearchOpen}
          onOpenChange={onBoardSearchOpenChange}
        />
        <BoardActivityDropdown boardId={boardId} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={copyBoardLink}
              aria-label={copy.share}
              className={cn('size-8', boardChromeButtonClass)}
            >
              <Share2Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copy.share}</TooltipContent>
        </Tooltip>
        <BoardLabelsDropdown boardId={boardId} canEdit={isBoardAdmin && !archived} />
        <BoardMembersDropdown
          boardId={boardId}
          workspaceId={workspaceId}
          canManage={isBoardAdmin}
        />
        <BoardSettingsDropdown
          boardId={boardId}
          workspaceId={workspaceId}
          currentIcon={currentIcon}
          currentBackground={background}
          canManage={isBoardAdmin}
          boardActive={!archived}
          archived={archived}
          open={settingsOpen}
          activeTab={settingsTab}
          onOpenChange={setSettingsOpen}
          onActiveTabChange={setSettingsTab}
          onRename={startRenamingFromMenu}
          onArchive={() => setArchiveDialogOpen(true)}
          onRestore={() =>
            restoreBoard.mutate({
              boardId,
              archived: false,
            })
          }
          restorePending={restoreBoard.isPending}
        />
      </div>

      {isBoardAdmin && (
        <>
          <ArchiveBoardDialog
            boardId={boardId}
            archived={archived}
            open={archiveDialogOpen}
            onOpenChange={setArchiveDialogOpen}
            hideTrigger
          />
        </>
      )}
    </header>
  );
}
