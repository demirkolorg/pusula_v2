'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArchiveIcon,
  CheckSquareIcon,
  ClockIcon,
  CopyIcon,
  PencilIcon,
} from 'lucide-react';
import {
  CardCompleteToggle,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
  toast,
} from '@pusula/ui';
import {
  canEditBoardContent,
  type BoardRole,
} from '@pusula/domain';
import {
  applyCardArchive,
  applyCardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import { RowArchiveDialog, RowRenameDialog } from './row-action-dialogs';
import { isArchivedCard, type CardRow } from './types';

type CardsColumnProps = {
  workspaceId: string | null;
  boardId: string | null;
  listId: string | null;
  /**
   * Viewer's role on the current board — drives context menu gating. `null`
   * when no board is selected (column shows empty state). Sağ tık eylemleri
   * (yeniden adlandır + arşivle + kopyala) `member+` ister.
   */
  boardRole?: BoardRole | null;
  cards: readonly CardRow[];
  onBack?: () => void;
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

type DueTone = 'destructive' | 'warning' | 'muted';

type DueChip = { label: string; tone: DueTone };

/**
 * Categorise a card's due date for the Sütun 4 chip:
 * - overdue (`< now`) → destructive ("Vadesi geçti")
 * - today (in [start-of-today, start-of-tomorrow)) → warning ("Bugün")
 * - tomorrow (in [start-of-tomorrow, +24h)) → muted ("Yarın")
 * - later → muted ("N gün sonra")
 */
function resolveDueChip(dueAt: Date, now: Date = new Date()): DueChip {
  if (dueAt.getTime() < now.getTime()) {
    return { label: strings.home.cardsColumn.dueOverdue, tone: 'destructive' };
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const ms24 = 24 * 60 * 60 * 1000;
  const startOfTomorrow = new Date(startOfToday.getTime() + ms24);
  const startOfDayAfter = new Date(startOfTomorrow.getTime() + ms24);
  if (dueAt.getTime() < startOfTomorrow.getTime()) {
    return { label: strings.home.cardsColumn.dueToday, tone: 'warning' };
  }
  if (dueAt.getTime() < startOfDayAfter.getTime()) {
    return { label: strings.home.cardsColumn.dueTomorrow, tone: 'muted' };
  }
  const diffDays = Math.ceil((dueAt.getTime() - now.getTime()) / ms24);
  return { label: strings.home.cardsColumn.dueInDays(diffDays), tone: 'muted' };
}

const DUE_TONE_CLASSES: Record<DueTone, string> = {
  destructive: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground',
};

/**
 * Sütun 4 — Cards (§13.11). Reads from the `board.get` payload (same source as
 * Sütun 3), filtered by `listId`. Each row is a complete-toggle + title + due
 * chip atom; metadata (etiket / üye / checklist) is intentionally absent —
 * detay için karta tıklanır ve board route'una yönlenilir (`?card=<id>`).
 * **Sağ tık** ile yeniden adlandır / kopyala / arşivle (2026-06-01 sağ tık turu);
 * üçü de board `member+` ister.
 */
export function CardsColumn({
  workspaceId,
  boardId,
  listId,
  boardRole = null,
  cards,
  onBack,
  isPending,
  isError,
  errorMessage,
}: CardsColumnProps) {
  const copy = strings.home.cardsColumn;
  const actionsCopy = strings.home.rowActions;
  const entityLabel = strings.home.entityLabels.card;
  const router = useRouter();
  const trpc = useTRPC();

  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const renameTarget = cards.find((c) => c.id === renameTargetId) ?? null;
  const archiveTarget = cards.find((c) => c.id === archiveTargetId) ?? null;

  const safeBoardId = boardId ?? '__none__';

  const completeCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.complete.mutationOptions,
    boardId: safeBoardId,
    cardId: (vars) => vars.cardId,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: true }),
  });
  const uncompleteCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.uncomplete.mutationOptions,
    boardId: safeBoardId,
    cardId: (vars) => vars.cardId,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: false }),
  });

  const renameMutation = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId: safeBoardId,
    cardId: (vars) => vars.cardId,
    apply: (data, vars) =>
      vars.title !== undefined
        ? applyCardPatch(data, vars.cardId, { title: vars.title })
        : data,
    onMutationError: () => toast.error(actionsCopy.genericError),
    onMutationSuccess: () => setRenameTargetId(null),
  });

  const archiveMutation = useOptimisticBoardMutation({
    mutationOptions: trpc.card.archive.mutationOptions,
    boardId: safeBoardId,
    cardId: (vars) => vars.cardId,
    apply: (data, vars) => applyCardArchive(data, vars.cardId),
    onMutationError: () => toast.error(actionsCopy.genericError),
    onMutationSuccess: () => setArchiveTargetId(null),
  });

  // Kopyala — `board.get` settle'da invalidate edilir, yeni kart refetch ile
  // gelir. Optimistic ekleme yok (yeni kart id'si server'dan döner; tahminle
  // bir temp kart eklemek karmaşıklık ister, ilk turun değerine eklemiyor).
  const copyMutation = useOptimisticBoardMutation({
    mutationOptions: trpc.card.copy.mutationOptions,
    boardId: safeBoardId,
    apply: (data) => data,
    onMutationError: () => toast.error(actionsCopy.copyCard.errorToast),
    onMutationSuccess: (_data, vars) => {
      const source = cards.find((c) => c.id === vars.cardId);
      if (source) toast(actionsCopy.copyCard.successToast(source.title));
    },
  });

  const filteredCards = useMemo(
    () => cards.filter((card) => card.listId === listId && !isArchivedCard(card)),
    [cards, listId],
  );

  const canEdit = useMemo(
    () =>
      boardRole != null &&
      canEditBoardContent({ workspaceRole: null, boardRole }),
    [boardRole],
  );

  const openInBoard = (cardId: string) => {
    if (!workspaceId || !boardId) return;
    router.push(`/workspaces/${workspaceId}/boards/${boardId}?card=${cardId}`);
  };

  return (
    <HomeColumnShell
      ariaLabel={copy.eyebrow}
      eyebrow={copy.eyebrow}
      count={copy.count(filteredCards.length)}
      icon={<CheckSquareIcon className="size-4" />}
      onBack={onBack}
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
    >
      {!listId ? (
        <HomeColumnEmpty
          icon={<CheckSquareIcon className="size-5" aria-hidden />}
          title={copy.selectListTitle}
          description={copy.selectListDescription}
        />
      ) : filteredCards.length === 0 ? (
        <HomeColumnEmpty
          icon={<CheckSquareIcon className="size-5" aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <ul className="space-y-1 p-2">
          {filteredCards.map((card) => {
            const dueChip = card.dueAt ? resolveDueChip(new Date(card.dueAt)) : null;
            const togglePending = completeCard.isPending || uncompleteCard.isPending;
            return (
              <li key={card.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild disabled={!canEdit}>
                    <div
                      className={cn(
                        'hover:bg-accent group relative flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                      )}
                    >
                      <CardCompleteToggle
                        checked={card.completed}
                        alwaysVisible={card.completed}
                        disabled={togglePending}
                        aria-label={
                          card.completed
                            ? copy.completedUntoggleLabel(card.title)
                            : copy.completedToggleLabel(card.title)
                        }
                        onCheckedChange={(next) => {
                          if (next) completeCard.mutate({ cardId: card.id });
                          else uncompleteCard.mutate({ cardId: card.id });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => openInBoard(card.id)}
                        aria-label={copy.openInBoard(card.title)}
                        className="focus-visible:ring-ring/60 min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-2"
                      >
                        <span
                          className={cn(
                            'truncate',
                            card.completed && 'text-muted-foreground line-through',
                          )}
                        >
                          {card.title}
                        </span>
                      </button>
                      {dueChip && !card.completed && (
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                            DUE_TONE_CLASSES[dueChip.tone],
                          )}
                        >
                          <ClockIcon className="size-3" aria-hidden />
                          {dueChip.label}
                        </span>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  {canEdit && (
                    <ContextMenuContent
                      aria-label={actionsCopy.triggerLabel(card.title)}
                    >
                      <ContextMenuItem onSelect={() => setRenameTargetId(card.id)}>
                        <PencilIcon className="size-3.5" aria-hidden />
                        {actionsCopy.rename}
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={copyMutation.isPending}
                        onSelect={() => {
                          // Aynı liste, kaynak kartın hemen ardına. Sub-eklemeler
                          // (checklist/etiket/üye) MVP'de kapalı — board ekranındaki
                          // tam kopyala akışı daha ayrıntılı seçenek sunabilir.
                          copyMutation.mutate({
                            cardId: card.id,
                            toListId: card.listId,
                            afterCardId: card.id,
                            includeChecklists: false,
                            includeMembers: false,
                            includeLabels: false,
                          });
                        }}
                      >
                        <CopyIcon className="size-3.5" aria-hidden />
                        {actionsCopy.copy}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => setArchiveTargetId(card.id)}
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
          if (!renameTarget) return;
          renameMutation.mutate({ cardId: renameTarget.id, title: nextValue });
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
          if (!archiveTarget) return;
          archiveMutation.mutate({ cardId: archiveTarget.id, archived: true });
        }}
      />
    </HomeColumnShell>
  );
}
