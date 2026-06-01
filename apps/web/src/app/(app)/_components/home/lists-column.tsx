'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  ArchiveIcon,
  ListIcon as ListGlyphIcon,
  PencilIcon,
} from 'lucide-react';
import {
  Badge,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import {
  canEditBoardContent,
  type BoardRole,
} from '@pusula/domain';
import {
  applyListArchive,
  applyListPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import {
  LIST_ICON_COMPONENTS,
  LIST_ICON_FG,
  asListIcon,
  asListIconColor,
} from '../../workspaces/[id]/boards/[boardId]/_components/list-icon-presentation';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import { RowArchiveDialog, RowRenameDialog } from './row-action-dialogs';
import { isArchivedList, type CardRow, type ListRow } from './types';

type ListsColumnProps = {
  /** Owning board id; null when Sütun 2'de seçim yok. */
  boardId: string | null;
  /**
   * Viewer's board role — drives context menu gating. `null` when no board is
   * selected (column shows empty state, no menu reachable anyway). Sağ tık
   * eylemleri (yeniden adlandır + arşivle) `member+` ister.
   */
  boardRole?: BoardRole | null;
  lists: readonly ListRow[];
  cards: readonly CardRow[];
  selectedListId: string | null;
  onSelect: (listId: string) => void;
  onBack?: () => void;
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

/**
 * Sütun 3 — Lists (§13.11). Reads from the same `board.get` payload as Sütun 4;
 * row shows list icon + title + card count. Read-only nav — yeni liste yalnızca
 * board ekranında oluşturulur (`+` butonu yok). **Sağ tık** ile yeniden adlandır
 * / arşivle (2026-06-01 sağ tık turu) — board `member+` yetkisi gerektirir.
 */
export function ListsColumn({
  boardId,
  boardRole = null,
  lists,
  cards,
  selectedListId,
  onSelect,
  onBack,
  isPending,
  isError,
  errorMessage,
}: ListsColumnProps) {
  const copy = strings.home.listsColumn;
  const actionsCopy = strings.home.rowActions;
  const entityLabel = strings.home.entityLabels.list;

  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const renameTarget = lists.find((l) => l.id === renameTargetId) ?? null;
  const archiveTarget = lists.find((l) => l.id === archiveTargetId) ?? null;

  const trpc = useTRPC();

  // `useOptimisticBoardMutation` boş `boardId` ile çağrılamaz (kanca her zaman
  // bir id ister); seçim yokken stub değer veriyoruz ve `enabled` gibi
  // şartla mutate'i bloklamıyoruz — sütun zaten boş olduğu için satır eylemi
  // tetiklenemez.
  const safeBoardId = boardId ?? '__none__';

  const renameMutation = useOptimisticBoardMutation({
    mutationOptions: trpc.list.update.mutationOptions,
    boardId: safeBoardId,
    apply: (data, vars) =>
      vars.title !== undefined
        ? applyListPatch(data, vars.listId, { title: vars.title })
        : data,
    onMutationError: () => toast.error(actionsCopy.genericError),
    onMutationSuccess: () => setRenameTargetId(null),
  });

  const archiveMutation = useOptimisticBoardMutation({
    mutationOptions: trpc.list.archive.mutationOptions,
    boardId: safeBoardId,
    apply: (data, vars) =>
      applyListArchive(data, vars.listId, vars.archived ? new Date() : null),
    onMutationError: () => toast.error(actionsCopy.genericError),
    onMutationSuccess: () => setArchiveTargetId(null),
  });

  const canEdit = useMemo(
    () =>
      boardRole != null &&
      canEditBoardContent({ workspaceRole: null, boardRole }),
    [boardRole],
  );

  /**
   * Tek geçişte üç sayaç: aktif kart toplamı, tamamlanmış kart, vadesi geçmiş
   * + tamamlanmamış kart. Listelerin sıralaması büyük değil; map + tek pass
   * yeterli (memoize edilir).
   */
  const statsByList = useMemo(() => {
    const stats = new Map<string, { total: number; done: number; overdue: number }>();
    const now = Date.now();
    for (const card of cards) {
      if (card.archivedAt != null) continue;
      const current = stats.get(card.listId) ?? { total: 0, done: 0, overdue: 0 };
      current.total += 1;
      if (card.completed) {
        current.done += 1;
      } else if (card.dueAt && new Date(card.dueAt).getTime() < now) {
        current.overdue += 1;
      }
      stats.set(card.listId, current);
    }
    return stats;
  }, [cards]);

  return (
    <HomeColumnShell
      ariaLabel={copy.eyebrow}
      eyebrow={copy.eyebrow}
      count={copy.count(lists.length)}
      icon={<ListGlyphIcon className="size-4" />}
      onBack={onBack}
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
    >
      {!boardId ? (
        <HomeColumnEmpty
          icon={<ListGlyphIcon className="size-5" aria-hidden />}
          title={copy.selectBoardTitle}
          description={copy.selectBoardDescription}
        />
      ) : lists.length === 0 ? (
        <HomeColumnEmpty
          icon={<ListGlyphIcon className="size-5" aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <ul className="space-y-1 p-2">
          {lists.map((list) => {
            const active = list.id === selectedListId;
            const archived = isArchivedList(list);
            const resolvedIcon = asListIcon(list.icon);
            const resolvedColor = asListIconColor(list.iconColor);
            const IconComponent = resolvedIcon
              ? LIST_ICON_COMPONENTS[resolvedIcon]
              : ListGlyphIcon;
            const iconColorClass = resolvedColor
              ? LIST_ICON_FG[resolvedColor]
              : 'text-muted-foreground';
            const stats = statsByList.get(list.id) ?? { total: 0, done: 0, overdue: 0 };
            // Arşivli liste sağ tık ile yeniden arşivlenemez/adlandırılamaz —
            // board ekranındaki "restore" akışı tek geri dönüş yolu.
            const showMenu = canEdit && !archived;

            return (
              <li key={list.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild disabled={!showMenu}>
                    <button
                      type="button"
                      aria-pressed={active}
                      data-active={active ? 'true' : undefined}
                      onClick={() => onSelect(list.id)}
                      className={cn(
                        'hover:bg-accent focus-visible:ring-ring/60 relative flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2',
                        active && 'bg-primary/10 text-foreground',
                        archived && 'opacity-60',
                      )}
                    >
                      {active && (
                        <span
                          className="bg-primary absolute inset-y-2 -left-2 w-0.5 rounded-full"
                          aria-hidden
                        />
                      )}
                      <span
                        className="bg-muted/50 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                        aria-hidden
                      >
                        <IconComponent className={cn('size-3.5', iconColorClass)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {archived && (
                            <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                              {copy.archivedBadge}
                            </Badge>
                          )}
                          <span className="truncate text-sm font-medium">{list.title}</span>
                        </span>
                      </span>
                      <ListStatsMeta stats={stats} />
                    </button>
                  </ContextMenuTrigger>
                  {showMenu && (
                    <ContextMenuContent
                      aria-label={actionsCopy.triggerLabel(list.title)}
                    >
                      <ContextMenuItem onSelect={() => setRenameTargetId(list.id)}>
                        <PencilIcon className="size-3.5" aria-hidden />
                        {actionsCopy.rename}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => setArchiveTargetId(list.id)}
                      >
                        <ArchiveIcon className="size-3.5" aria-hidden />
                        {actionsCopy.archive}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  )}
                </ContextMenu>
              </li>
            );
          })}
        </ul>
      )}

      <RowRenameDialog
        open={renameTarget != null}
        onOpenChange={(next) => {
          if (!next) setRenameTargetId(null);
        }}
        entityLabel={entityLabel}
        currentValue={renameTarget?.title ?? ''}
        isPending={renameMutation.isPending}
        errorMessage={getMutationErrorMessage(renameMutation)}
        onSubmit={(nextValue) => {
          if (!renameTarget || !boardId) return;
          renameMutation.mutate({
            boardId,
            listId: renameTarget.id,
            title: nextValue,
          });
        }}
      />

      <RowArchiveDialog
        open={archiveTarget != null}
        onOpenChange={(next) => {
          if (!next) setArchiveTargetId(null);
        }}
        entityLabel={entityLabel}
        isPending={archiveMutation.isPending}
        errorMessage={getMutationErrorMessage(archiveMutation)}
        onConfirm={() => {
          if (!archiveTarget || !boardId) return;
          archiveMutation.mutate({
            boardId,
            listId: archiveTarget.id,
            archived: true,
          });
        }}
      />
    </HomeColumnShell>
  );
}

type ListStats = { total: number; done: number; overdue: number };

/**
 * Liste satırının sağındaki kompakt sayaç. İki atom:
 *  - Kırmızı "vadesi geçti" mikro-rozet — yalnızca `overdue > 0` durumunda.
 *  - Tamamlanma fraction'ı ("3/8") — `total > 0` durumunda; yoksa "0 kart".
 *
 * `tabular-nums` ile sütun hizalanır; aria-label tooltip ile aynı insan-okuyabilir
 * metni taşır (screen reader için yeterli bağlam).
 */
function ListStatsMeta({ stats }: { stats: ListStats }) {
  const copy = strings.home.listsColumn;
  if (stats.total === 0) {
    return (
      <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
        {copy.cardCount(0)}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {stats.overdue > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="status"
              aria-label={copy.overdueBadge(stats.overdue)}
              className="bg-destructive/10 text-destructive inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums"
            >
              <AlertCircleIcon className="size-3" aria-hidden />
              {stats.overdue}
            </span>
          </TooltipTrigger>
          <TooltipContent>{copy.overdueBadge(stats.overdue)}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={copy.progressLabel(stats.done, stats.total)}
            className="text-muted-foreground text-[11px] tabular-nums"
          >
            {copy.progress(stats.done, stats.total)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{copy.progressLabel(stats.done, stats.total)}</TooltipContent>
      </Tooltip>
    </span>
  );
}
