'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ActivityIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  LayoutGridIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ArchiveBoardDialog, useRestoreBoard } from './archive-board-dialog';
import { BoardSettingsDialog } from './board-settings/board-settings-dialog';
import { RenameBoardForm } from './rename-board-form';

type BoardTopBarProps = {
  boardId: string;
  workspaceId: string;
  title: string;
  /** The board's archived state — drives the "Arşivli" badge + read-only affordances. */
  archived: boolean;
  /** Whether the viewer is board `admin` — gates rename / archive / settings. */
  isBoardAdmin: boolean;
};

/** A disabled action button that explains (via tooltip) that the feature is coming later. */
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

/** The "Pano / Liste / Etiketler" view switch — only "Pano" is active this phase. */
function BoardViewSwitch() {
  const copy = strings.board.topBar;
  return (
    <div
      role="tablist"
      aria-label={copy.eyebrow}
      className="bg-secondary inline-flex rounded-md border p-[3px]"
    >
      <span
        role="tab"
        aria-selected
        className="bg-card rounded-sm px-2.5 py-1 text-xs font-medium shadow-xs"
      >
        {copy.viewBoard}
      </span>
      {[copy.viewList, copy.viewLabels].map((label) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <span
              role="tab"
              aria-selected={false}
              aria-disabled
              className="text-muted-foreground/70 cursor-not-allowed rounded-sm px-2.5 py-1 text-xs font-medium"
            >
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{copy.viewSoon}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * The board screen's top bar: the board identity (back-linked icon + "Pano"
 * eyebrow + name + a "favourite" placeholder), the "Pano / Liste / Etiketler"
 * view switch (only "Pano" active), and the actions
 * (invite → board settings, search/activity placeholders, "⋮" menu → rename /
 * archive / restore / settings). Mutation flow is unchanged — rename goes
 * through `RenameBoardForm` (`board.update`), archive/restore through
 * `ArchiveBoardDialog` / `useRestoreBoard` (`board.archive`). Drag-and-drop and
 * the "Liste"/"Etiketler" views are out of scope (Phase 3 / later).
 */
export function BoardTopBar({
  boardId,
  workspaceId,
  title,
  archived,
  isBoardAdmin,
}: BoardTopBarProps) {
  const copy = strings.board.topBar;

  const [renaming, setRenaming] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const restoreBoard = useRestoreBoard(boardId);

  return (
    <header className="flex min-h-14 items-center gap-3 bg-background px-4 py-2 sm:gap-4">
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href={`/workspaces/${workspaceId}`}
          aria-label={strings.board.detail.backToWorkspace}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <LayoutGridIcon className="size-4" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
            {copy.eyebrow}
          </span>
          {isBoardAdmin && !archived ? (
            <RenameBoardForm
              boardId={boardId}
              title={title}
              editing={renaming}
              onEditingChange={setRenaming}
              hideTrigger
            />
          ) : (
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-[15px] font-semibold">{title}</h1>
              {archived && (
                <ArchiveIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              )}
            </div>
          )}
        </div>
        {archived && <Badge variant="outline">{copy.archivedBadge}</Badge>}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={copy.favorite}
                disabled
              >
                <StarIcon className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{copy.favoriteSoon}</TooltipContent>
        </Tooltip>
      </div>

      {/* View switch */}
      <BoardViewSwitch />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {isBoardAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="font-semibold"
          >
            <UserPlusIcon className="size-4" />
            {copy.invite}
          </Button>
        )}
        <ComingSoonAction
          icon={<SearchIcon className="size-4" />}
          label={copy.search}
          hint={copy.searchSoon}
        />
        <ComingSoonAction
          icon={<ActivityIcon className="size-4" />}
          label={copy.activity}
          hint={copy.activitySoon}
        />
        {isBoardAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={copy.more}
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!archived && (
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <PencilIcon />
                  {copy.menuRename}
                </DropdownMenuItem>
              )}
              {archived ? (
                <DropdownMenuItem
                  onSelect={() =>
                    restoreBoard.mutate({
                      boardId,
                      archived: false,
                    })
                  }
                  disabled={restoreBoard.isPending}
                >
                  <ArchiveRestoreIcon />
                  {copy.menuRestore}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveDialogOpen(true)}>
                  <ArchiveIcon />
                  {copy.menuArchive}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2Icon />
                {copy.menuSettings}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* External-trigger dialogs (rendered once; opened from the menu / invite button). */}
      {isBoardAdmin && (
        <>
          <ArchiveBoardDialog
            boardId={boardId}
            archived={archived}
            open={archiveDialogOpen}
            onOpenChange={setArchiveDialogOpen}
            hideTrigger
          />
          <BoardSettingsDialog
            boardId={boardId}
            workspaceId={workspaceId}
            canManage
            boardActive={!archived}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            hideTrigger
          />
        </>
      )}
    </header>
  );
}
