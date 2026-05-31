'use client';

import { useState, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, LayoutGridIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { Badge, Button, boardBackgroundClass, cn } from '@pusula/ui';
import { formatRelativeTime } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';
import { CreateBoardDialog } from '../../workspaces/[id]/_components/create-board-dialog';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import type { BoardRow, WorkspaceRow } from './types';

type BoardsColumnProps = {
  /** Owning workspace; null when Sütun 1'de seçim yok. */
  workspace: WorkspaceRow | null;
  boards: readonly BoardRow[];
  selectedBoardId: string | null;
  onSelect: (boardId: string) => void;
  onBack?: () => void;
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

function roleBadgeVariant(role: BoardRow['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'admin') return 'default';
  if (role === 'member') return 'secondary';
  return 'outline';
}

/** Workspace `guest`'i pano oluşturamaz; üst seviye gate (member+). */
function canCreateBoard(workspace: WorkspaceRow): boolean {
  return workspace.role !== 'guest';
}

/**
 * Sütun 2 — Boards (§13.11). Lists the boards of the selected workspace,
 * grouped: starred boards on top under a small "Favoriler" label, then the
 * remainder sorted by `updatedAt desc`. Her satırın sağında iki ikon-buton var
 * (2026-06-01 kararı): **ayarlar** (`/.../settings`) ve **git** (`/.../boards/<id>`).
 * Favori toggle'ı board ekranındaki üst bar'a taşındı; anasayfa satırında yok.
 * `+` button opens {@link CreateBoardDialog} when the viewer is workspace `member+`.
 */
export function BoardsColumn({
  workspace,
  boards,
  selectedBoardId,
  onSelect,
  onBack,
  isPending,
  isError,
  errorMessage,
}: BoardsColumnProps) {
  const copy = strings.home.boardsColumn;
  const [createOpen, setCreateOpen] = useState(false);

  const { favorites, others } = useMemo(() => {
    const fav: BoardRow[] = [];
    const oth: BoardRow[] = [];
    for (const board of boards) {
      if (board.favorited) fav.push(board);
      else oth.push(board);
    }
    const byUpdated = (a: BoardRow, b: BoardRow) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    fav.sort(byUpdated);
    oth.sort(byUpdated);
    return { favorites: fav, others: oth };
  }, [boards]);

  let body: ReactNode;
  if (!workspace) {
    body = (
      <HomeColumnEmpty
        icon={<LayoutGridIcon className="size-5" aria-hidden />}
        title={copy.selectWorkspaceTitle}
        description={copy.selectWorkspaceDescription}
      />
    );
  } else if (boards.length === 0) {
    body = (
      <HomeColumnEmpty
        icon={<LayoutGridIcon className="size-5" aria-hidden />}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        cta={
          canCreateBoard(workspace) ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-3.5" aria-hidden />
              {copy.addLabel}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <div className="p-2">
        {favorites.length > 0 && (
          <BoardGroup
            label={copy.favoritesGroupTitle}
            boards={favorites}
            workspaceId={workspace.id}
            selectedBoardId={selectedBoardId}
            onSelect={onSelect}
          />
        )}
        {others.length > 0 && (
          <BoardGroup
            label={favorites.length > 0 ? copy.othersGroupTitle : undefined}
            boards={others}
            workspaceId={workspace.id}
            selectedBoardId={selectedBoardId}
            onSelect={onSelect}
          />
        )}
      </div>
    );
  }

  const addButton =
    workspace && canCreateBoard(workspace) ? (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        aria-label={copy.addLabel}
        onClick={() => setCreateOpen(true)}
      >
        <PlusIcon className="size-4" aria-hidden />
      </Button>
    ) : undefined;

  return (
    <HomeColumnShell
      ariaLabel={copy.eyebrow}
      eyebrow={copy.eyebrow}
      count={copy.count(boards.length)}
      icon={<LayoutGridIcon className="size-4" />}
      action={addButton}
      onBack={onBack}
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
    >
      {workspace && (
        <CreateBoardDialog
          workspaceId={workspace.id}
          hideTrigger
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
      {body}
    </HomeColumnShell>
  );
}

type BoardGroupProps = {
  label?: string;
  boards: readonly BoardRow[];
  workspaceId: string;
  selectedBoardId: string | null;
  onSelect: (boardId: string) => void;
};

function BoardGroup({ label, boards, workspaceId, selectedBoardId, onSelect }: BoardGroupProps) {
  return (
    <div className="mb-3 last:mb-0">
      {label && (
        <p className="text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </p>
      )}
      <ul className="space-y-1">
        {boards.map((board) => (
          <BoardRowItem
            key={board.id}
            board={board}
            workspaceId={workspaceId}
            active={board.id === selectedBoardId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}

type BoardRowItemProps = {
  board: BoardRow;
  workspaceId: string;
  active: boolean;
  onSelect: (boardId: string) => void;
};

function BoardRowItem({ board, workspaceId, active, onSelect }: BoardRowItemProps) {
  const lastActivity = board.lastActivityAt
    ? strings.home.boardsColumn.lastActivity(formatRelativeTime(board.lastActivityAt))
    : strings.home.boardsColumn.lastActivityNever;

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={active}
        data-active={active ? 'true' : undefined}
        onClick={() => onSelect(board.id)}
        className={cn(
          'hover:bg-accent focus-visible:ring-ring/60 relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2',
          active && 'bg-primary/10 text-foreground',
        )}
      >
        {active && (
          <span
            className="bg-primary absolute inset-y-2 -left-2 w-0.5 rounded-full"
            aria-hidden
          />
        )}
        <span
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
            boardBackgroundClass(board.background ?? null),
          )}
          aria-hidden
        >
          <LayoutGridIcon className="size-3.5 text-white drop-shadow" />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-semibold">{board.title}</span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-[11px]">
            <Badge
              variant={roleBadgeVariant(board.role)}
              className="shrink-0 px-1 py-0 text-[9px]"
            >
              {boardRoleLabels[board.role]}
            </Badge>
            <span className="truncate">{lastActivity}</span>
          </span>
        </span>
      </button>
      <BoardRowActions
        workspaceId={workspaceId}
        boardId={board.id}
        boardTitle={board.title}
      />
    </li>
  );
}

type BoardRowActionsProps = {
  workspaceId: string;
  boardId: string;
  boardTitle: string;
};

/**
 * Sütun 2 satır eylemleri: **ayarlar** + **git**. İki kompakt `<Link>`;
 * `e.stopPropagation` gerek yok çünkü seçim button ayrı bir node. Settings
 * Sütun 1 workspace satırlarındaki ile aynı `Settings2Icon`'u kullanır (UI
 * tutarlılığı); git ikonu olarak `ArrowUpRight` — board sayfasına yönlen.
 */
function BoardRowActions({ workspaceId, boardId, boardTitle }: BoardRowActionsProps) {
  const copy = strings.home.boardsColumn;
  const settingsAriaLabel = copy.settingsLabel(boardTitle);
  const openAriaLabel = copy.openLabel(boardTitle);
  const actionClass =
    'text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2';

  return (
    <>
      <Link
        href={`/workspaces/${workspaceId}/boards/${boardId}/settings`}
        aria-label={settingsAriaLabel}
        title={settingsAriaLabel}
        className={actionClass}
      >
        <Settings2Icon className="size-3.5" aria-hidden />
        <span>{copy.settingsAction}</span>
      </Link>
      <Link
        href={`/workspaces/${workspaceId}/boards/${boardId}`}
        aria-label={openAriaLabel}
        title={openAriaLabel}
        className={actionClass}
      >
        <ArrowUpRightIcon className="size-3.5" aria-hidden />
        <span>{copy.openAction}</span>
      </Link>
    </>
  );
}
