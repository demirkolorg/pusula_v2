'use client';

import { useState } from 'react';
import {
  ActivityIcon,
  CheckIcon,
  FilterIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  Share2Icon,
  TagsIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ArchiveBoardDialog, useRestoreBoard } from './archive-board-dialog';
import { BoardActivityDrawer } from './board-activity-drawer';
import {
  ArchivedItemsDropdown,
  type BoardArchiveList,
} from './archived-items-dropdown';
import { BoardFilterMenuContent, type BoardFilterMenuContentProps } from './board-filter-bar';
import {
  BoardSettingsDropdown,
  type BoardSettingsTab,
} from './board-settings/board-settings-dropdown';
import { RenameBoardForm } from './rename-board-form';

type BoardTopBarProps = {
  boardId: string;
  workspaceId: string;
  title: string;
  background: string | null;
  archived: boolean;
  isBoardAdmin: boolean;
  filter?: BoardFilterMenuContentProps;
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

function ComingSoonAction({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={label}
            disabled
          >
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function BoardViewMenu() {
  const copy = strings.board.topBar;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={copy.viewMenu}
        >
          <LayoutGridIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuCheckboxItem
          checked
          onCheckedChange={() => undefined}
          onSelect={(event) => event.preventDefault()}
        >
          <CheckIcon className="text-primary" />
          {copy.viewBoard}
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem disabled>
          <ListIcon />
          {copy.viewList}
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <TagsIcon />
          {copy.viewLabels}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BoardFilterMenu({ filter }: { filter: BoardFilterMenuContentProps }) {
  const copy = strings.board.filter;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={copy.labelsTitle}
        >
          <FilterIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <BoardFilterMenuContent {...filter} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BoardTopBar({
  boardId,
  workspaceId,
  title,
  background,
  archived,
  isBoardAdmin,
  filter,
  archive,
}: BoardTopBarProps) {
  const copy = strings.board.topBar;

  const [renaming, setRenaming] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<BoardSettingsTab>('members');
  const [activityOpen, setActivityOpen] = useState(false);
  const restoreBoard = useRestoreBoard(boardId);

  const startRenamingFromMenu = () => {
    window.setTimeout(() => setRenaming(true), 0);
  };

  const openSettings = (tab: BoardSettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
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
    <header className="flex min-h-14 items-center gap-2 bg-background px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isBoardAdmin && !archived ? (
          <RenameBoardForm
            boardId={boardId}
            title={title}
            editing={renaming}
            onEditingChange={setRenaming}
            hideTrigger
          />
        ) : (
          <h1 className="min-w-0 truncate text-[15px] font-semibold">{title}</h1>
        )}
        {archived && <Badge variant="outline">{copy.archivedBadge}</Badge>}
        <BoardViewMenu />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {filter && <BoardFilterMenu filter={filter} />}
        {archive && <ArchivedItemsDropdown boardId={boardId} {...archive} />}
        <ComingSoonAction
          icon={<SearchIcon className="size-4" />}
          label={copy.search}
          hint={copy.searchSoon}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={copy.activity}
              onClick={() => setActivityOpen(true)}
            >
              <ActivityIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copy.activity}</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyBoardLink}
          className="font-semibold"
        >
          <Share2Icon className="size-4" />
          {copy.share}
        </Button>
        {isBoardAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openSettings('invitations')}
            className="font-semibold"
          >
            <UserPlusIcon className="size-4" />
            {copy.invite}
          </Button>
        )}
        <BoardSettingsDropdown
          boardId={boardId}
          workspaceId={workspaceId}
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

      <BoardActivityDrawer boardId={boardId} open={activityOpen} onOpenChange={setActivityOpen} />
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
