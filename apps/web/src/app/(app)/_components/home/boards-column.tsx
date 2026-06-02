'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  LayoutGridIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Settings2Icon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  boardBackgroundClass,
  cn,
  toast,
} from '@pusula/ui';
import type { RouterOutputs } from '@pusula/api';
import { canManageBoard } from '@pusula/domain';
import { formatRelativeTime } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateBoardDialog } from '../../workspaces/[id]/_components/create-board-dialog';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import { RowArchiveDialog, RowRenameDialog } from './row-action-dialogs';
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
 * Per-row action callbacks — surfaced to `BoardRowItem` via `BoardGroup`.
 * Hepsi pasif: BoardsColumn ana state'i (rename/archive target + mutations)
 * yönetir, satırdaki ContextMenu sadece tetikler.
 */
type BoardRowActionsHandlers = {
  onRenameRequest: (board: BoardRow) => void;
  onArchiveRequest: (board: BoardRow) => void;
  onToggleFavorite: (board: BoardRow) => void;
};

/**
 * Sütun 2 — Boards (§13.11). Lists the boards of the selected workspace,
 * grouped: starred boards on top under a small "Favoriler" label, then the
 * remainder sorted by `updatedAt desc`. Tüm satır eylemleri **sağ tık**
 * menüsünde toplanır (2026-06-02 kararı: inline ikon-butonlar kaldırıldı):
 * **aç** (`/.../boards/<id>`) · **ayarlar** (`/.../settings`) · yeniden adlandır /
 * sabitle / arşivle; sabitle her viewer için bireyseldir, rename + archive
 * board `admin` ister.
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
  const actionsCopy = strings.home.rowActions;
  const entityLabel = strings.home.entityLabels.board;
  const [createOpen, setCreateOpen] = useState(false);

  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const renameTarget = boards.find((b) => b.id === renameTargetId) ?? null;
  const archiveTarget = boards.find((b) => b.id === archiveTargetId) ?? null;

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // `workspaceId` her zaman var (rendering bu sütun yalnız workspace seçili
  // iken anlamlı); guard mutation closure'larında.
  const workspaceId = workspace?.id ?? null;
  const listQueryKey = workspaceId
    ? trpc.board.list.queryKey({ workspaceId })
    : null;

  type BoardListData = RouterOutputs['board']['list'];
  const patchListItem = useCallback(
    (targetId: string, patch: Partial<BoardListData[number]>) => {
      if (!listQueryKey) return;
      queryClient.setQueryData<BoardListData>(listQueryKey, (prev) =>
        prev ? prev.map((b) => (b.id === targetId ? { ...b, ...patch } : b)) : prev,
      );
    },
    [queryClient, listQueryKey],
  );
  const removeListItem = useCallback(
    (targetId: string) => {
      if (!listQueryKey) return;
      queryClient.setQueryData<BoardListData>(listQueryKey, (prev) =>
        prev ? prev.filter((b) => b.id !== targetId) : prev,
      );
    },
    [queryClient, listQueryKey],
  );

  const renameMutation = useMutation(
    trpc.board.update.mutationOptions({
      onSuccess: (data) => {
        // `data.id` her durumda mevcut (changed=true/false aynı şekle çıkar).
        if (data.title != null) {
          patchListItem(data.id, { title: data.title });
        }
        setRenameTargetId(null);
      },
    }),
  );

  const archiveMutation = useMutation(
    trpc.board.archive.mutationOptions({
      onSuccess: (_data, vars) => {
        removeListItem(vars.boardId);
        setArchiveTargetId(null);
      },
    }),
  );

  // setFavorite anlık eylem (dialog yok). Optimistik patch + revert on error.
  const favoriteMutation = useMutation(
    trpc.board.setFavorite.mutationOptions({
      onMutate: (vars) => {
        if (!listQueryKey) return { previous: null as BoardListData | null };
        const previous = queryClient.getQueryData<BoardListData>(listQueryKey) ?? null;
        patchListItem(vars.boardId, { favorited: vars.favorited });
        return { previous };
      },
      onError: (_err, _vars, ctx) => {
        const previous = ctx?.previous ?? null;
        if (previous && listQueryKey) {
          queryClient.setQueryData(listQueryKey, previous);
        }
        toast.error(actionsCopy.pin_.error);
      },
      onSuccess: (data) => {
        const board = boards.find((b) => b.id === data.boardId);
        const title = board?.title ?? '';
        toast(
          data.favorited
            ? actionsCopy.pin_.successPinned(title)
            : actionsCopy.pin_.successUnpinned(title),
        );
      },
    }),
  );

  const handlers: BoardRowActionsHandlers = useMemo(
    () => ({
      onRenameRequest: (board) => setRenameTargetId(board.id),
      onArchiveRequest: (board) => setArchiveTargetId(board.id),
      onToggleFavorite: (board) =>
        favoriteMutation.mutate({ boardId: board.id, favorited: !board.favorited }),
    }),
    [favoriteMutation],
  );

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
            actions={handlers}
          />
        )}
        {others.length > 0 && (
          <BoardGroup
            label={favorites.length > 0 ? copy.othersGroupTitle : undefined}
            boards={others}
            workspaceId={workspace.id}
            selectedBoardId={selectedBoardId}
            onSelect={onSelect}
            actions={handlers}
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

      <RowRenameDialog
        open={renameTarget != null}
        onOpenChange={(next) => {
          if (!next) setRenameTargetId(null);
        }}
        entityLabel={entityLabel}
        currentValue={renameTarget?.title ?? ''}
        isPending={renameMutation.isPending}
        errorMessage={renameMutation.error?.message ?? null}
        onSubmit={(nextValue) => {
          if (!renameTarget) return;
          renameMutation.mutate({ boardId: renameTarget.id, title: nextValue });
        }}
      />

      <RowArchiveDialog
        open={archiveTarget != null}
        onOpenChange={(next) => {
          if (!next) setArchiveTargetId(null);
        }}
        entityLabel={entityLabel}
        isPending={archiveMutation.isPending}
        errorMessage={archiveMutation.error?.message ?? null}
        onConfirm={() => {
          if (!archiveTarget) return;
          archiveMutation.mutate({ boardId: archiveTarget.id, archived: true });
        }}
      />
    </HomeColumnShell>
  );
}

type BoardGroupProps = {
  label?: string;
  boards: readonly BoardRow[];
  workspaceId: string;
  selectedBoardId: string | null;
  onSelect: (boardId: string) => void;
  actions: BoardRowActionsHandlers;
};

function BoardGroup({
  label,
  boards,
  workspaceId,
  selectedBoardId,
  onSelect,
  actions,
}: BoardGroupProps) {
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
            actions={actions}
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
  actions: BoardRowActionsHandlers;
};

/** Pano satırı üye avatar stack'inde en fazla görünür avatar sayısı. */
const BOARD_MEMBERS_MAX_AVATARS = 3;

function BoardRowItem({ board, workspaceId, active, onSelect, actions }: BoardRowItemProps) {
  const copy = strings.home.boardsColumn;
  const actionsCopy = strings.home.rowActions;
  const lastActivity = board.lastActivityAt
    ? copy.lastActivity(formatRelativeTime(board.lastActivityAt))
    : copy.lastActivityNever;

  // Açık/bitti mikro-meta — yalnız "öyle ya da böyle kart var" durumunda
  // göster. Tamamen boş panoda gürültü olur.
  const hasCounts = board.openCount > 0 || board.doneCount > 0;
  const countsLabel = hasCounts
    ? copy.openDoneSummary(board.openCount, board.doneCount)
    : null;

  // Yetki gating: rename + arşivleme yalnız board admin (server doğrular);
  // sabitle her viewer için kendi favorisini değiştirir.
  const canManage = canManageBoard({
    workspaceRole: null,
    boardRole: board.role,
  });

  return (
    <li className="flex items-center">
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold">{board.title}</span>
                <BoardMembersStack members={board.members} />
              </span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-[11px]">
                <Badge
                  variant={roleBadgeVariant(board.role)}
                  className="shrink-0 px-1 py-0 text-[9px]"
                >
                  {boardRoleLabels[board.role]}
                </Badge>
                {countsLabel && (
                  <>
                    <span aria-hidden className="shrink-0">·</span>
                    <span className="shrink-0 tabular-nums">{countsLabel}</span>
                  </>
                )}
                <span aria-hidden className="shrink-0">·</span>
                <span className="truncate">{lastActivity}</span>
              </span>
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent aria-label={actionsCopy.triggerLabel(board.title)}>
          <ContextMenuItem asChild>
            <Link href={`/workspaces/${workspaceId}/boards/${board.id}`}>
              <ArrowUpRightIcon className="size-3.5" aria-hidden />
              {copy.openAction}
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <Link href={`/workspaces/${workspaceId}/boards/${board.id}/settings`}>
              <Settings2Icon className="size-3.5" aria-hidden />
              {copy.settingsAction}
            </Link>
          </ContextMenuItem>
          <ContextMenuSeparator />
          {canManage && (
            <ContextMenuItem onSelect={() => actions.onRenameRequest(board)}>
              <PencilIcon className="size-3.5" aria-hidden />
              {actionsCopy.rename}
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => actions.onToggleFavorite(board)}>
            {board.favorited ? (
              <>
                <PinOffIcon className="size-3.5" aria-hidden />
                {actionsCopy.unpin}
              </>
            ) : (
              <>
                <PinIcon className="size-3.5" aria-hidden />
                {actionsCopy.pin}
              </>
            )}
          </ContextMenuItem>
          {canManage && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => actions.onArchiveRequest(board)}
              >
                <ArchiveIcon className="size-3.5" aria-hidden />
                {actionsCopy.archive}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

/**
 * Pano satırının sağına basılan kompakt üye avatar yığını. Max 3 görünür
 * avatar + "+N" rozeti. Üyesiz panoda hiç render olmaz; bir tooltip ile tüm
 * üye adları okunabilir.
 */
function BoardMembersStack({ members }: { members: BoardRow['members'] }) {
  if (members.length === 0) return null;
  const copy = strings.home.boardsColumn;
  const visible = members.slice(0, BOARD_MEMBERS_MAX_AVATARS);
  const remaining = members.length - visible.length;
  const tooltipLabel = `${copy.membersTooltip(members.length)} · ${members
    .map((m) => m.name?.trim() || copy.membersTooltip(1))
    .join(', ')}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={copy.membersTooltip(members.length)}
          className="ml-auto inline-flex shrink-0 items-center -space-x-1"
        >
          {visible.map((member) => (
            <Avatar
              key={`${member.userId}-${member.role}`}
              name={member.name}
              image={member.image}
              size="xs"
              ring
            />
          ))}
          {remaining > 0 && (
            <span
              aria-label={copy.extraMembersLabel(remaining)}
              className="bg-muted text-muted-foreground ring-card relative inline-flex size-4 items-center justify-center rounded-full text-[9px] font-medium ring-2"
            >
              +{remaining}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

