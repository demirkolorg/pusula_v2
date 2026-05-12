'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ActivityIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
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
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={label} disabled>
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
 * The board screen's top bar: a back link, the board identity (icon + "Pano"
 * eyebrow + name with inline rename for admins + a "favourite" placeholder), the
 * "Pano / Liste / Etiketler" view switch (only "Pano" active), and the actions
 * (invite → board settings, search/activity placeholders, "⋮" menu → rename /
 * archive / restore / settings). Mutation flow is unchanged — rename goes
 * through `RenameBoardForm` (`board.update`), archive/restore through
 * `ArchiveBoardDialog` / `useRestoreBoard` (`board.archive`). Drag-and-drop and
 * the "Liste"/"Etiketler" views are out of scope (Phase 3 / later).
 */
export function BoardTopBar({ boardId, workspaceId, title, archived, isBoardAdmin }: BoardTopBarProps) {
  const copy = strings.board.topBar;
  const detailCopy = strings.board.detail;

  const [renaming, setRenaming] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const restoreBoard = useRestoreBoard(boardId);

  return (
    <div className="bg-background flex flex-col gap-2 border-b pb-3">
      <Link
        href={`/workspaces/${workspaceId}`}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon className="size-3.5" />
        {detailCopy.backToWorkspace}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        {/* Identity */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="bg-primary inline-flex size-7 shrink-0 items-center justify-center rounded-md"
            aria-hidden
          >
            <LayoutGridIcon className="text-primary-foreground size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground text-[10px] font-medium uppercase">{copy.eyebrow}</span>
            {isBoardAdmin && !archived ? (
              <RenameBoardForm
                boardId={boardId}
                title={title}
                editing={renaming}
                onEditingChange={setRenaming}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="truncate text-sm font-semibold">{title}</h1>
                {archived && <ArchiveIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
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
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={copy.more}>
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
                        clientMutationId: crypto.randomUUID(),
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
    </div>
  );
}
