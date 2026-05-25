'use client';

import { useState } from 'react';
import {
  FileDownIcon,
  FilterIcon,
  InboxIcon,
  Loader2Icon,
  Share2Icon,
  UserCheckIcon,
} from 'lucide-react';
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
import { useDownloadBoardReport } from '@/lib/pdf/use-download-board-report';
import { strings } from '@/lib/strings';
import { ArchiveBoardDialog, useRestoreBoard } from './archive-board-dialog';
import { BoardActivityDropdown } from './board-activity-dropdown';
import { ArchivedItemsDropdown, type BoardArchiveList } from './archived-items-dropdown';
import { BoardReportsButton } from '@/components/reports/entity-tab/board-reports-button';
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
  /**
   * "Hızlı Notlar" panel toggle (DEM-205): opens/closes the personal quick-note
   * capture panel on the left of the board. `open` drives the pressed state.
   */
  quickNotes?: { open: boolean; onToggle: () => void };
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

/**
 * "Hızlı Notlar" panel toggle — a single chrome icon button (no dropdown).
 * `aria-pressed` exposes the panel's open/closed state; when open the button
 * keeps the highlight so the panel is visibly engaged.
 */
function QuickNotesToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = strings.board.quickNotes.toggle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={open}
          aria-label={label}
          onClick={onToggle}
          className={cn('size-8', boardChromeButtonClass, open && 'bg-white/15')}
        >
          <InboxIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Faz 14F (DEM-296) — Klasik pano PDF tek-tık indirme butonu. Üst bar chrome
 * ikon serisinde (Filtre/Arşiv yanı); dropdown derinliği yerine eski Pusula
 * refleksi tek tık. `useDownloadBoardReport` hook'u indirme state'ini yönetir
 * (paralel ikinci tıklama disable; toast içerir).
 */
function DownloadReportButton({
  boardId,
  boardTitle,
}: {
  boardId: string;
  boardTitle: string;
}) {
  const copy = strings.board.topBar;
  const { download, isDownloading } = useDownloadBoardReport({ boardId, boardTitle });
  const label = isDownloading ? copy.menuDownloadReportBusy : copy.menuDownloadReport;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-busy={isDownloading}
          disabled={isDownloading}
          onClick={() => void download()}
          className={cn('size-8', boardChromeButtonClass)}
        >
          {isDownloading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <FileDownIcon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
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
  quickNotes,
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
        {quickNotes && (
          <QuickNotesToggle open={quickNotes.open} onToggle={quickNotes.onToggle} />
        )}
        {assignedToMe && (
          <AssignedToMeToggle active={assignedToMe.active} onToggle={assignedToMe.onToggle} />
        )}
        {filter && <BoardFilterMenu filter={filter} />}
        <DownloadReportButton boardId={boardId} boardTitle={title} />
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
        {/* Faz 13G (DEM-263) — board scope rapor composer'ı açar. */}
        <BoardReportsButton
          boardId={boardId}
          workspaceId={workspaceId}
          className={boardChromeButtonClass}
        />
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
