'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, ListIcon, MoveRightIcon } from 'lucide-react';
import type { RouterOutputs } from '@pusula/api';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { getMutationErrorMessage } from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

export type BoardArchiveList = {
  id: string;
  title: string;
  archivedAt: Date | string | null;
};

type ArchivedCard = RouterOutputs['card']['listArchived'][number];

type ArchivedItemsDropdownProps = {
  boardId: string;
  lists: BoardArchiveList[];
  canEdit: boolean;
  showArchivedLists: boolean;
  onToggleArchivedLists: () => void;
  showArchivedCards: boolean;
  onToggleArchivedCards: () => void;
  archivedListCount: number;
};

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

function mutationMessage(mutation: { isError: boolean; error: unknown }) {
  return getMutationErrorMessage(mutation) ?? strings.common.unknownError;
}

export function ArchivedItemsDropdown({
  boardId,
  lists,
  canEdit,
  showArchivedLists,
  onToggleArchivedLists,
  showArchivedCards,
  onToggleArchivedCards,
  archivedListCount,
}: ArchivedItemsDropdownProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.archive;
  const [open, setOpen] = useState(false);
  const [targetByCardId, setTargetByCardId] = useState<Record<string, string>>({});

  const archivedCardsQuery = useQuery(
    trpc.card.listArchived.queryOptions({ boardId }, { enabled: open }),
  );

  const archivedLists = useMemo(() => lists.filter((list) => list.archivedAt != null), [lists]);
  const activeLists = useMemo(() => lists.filter((list) => list.archivedAt == null), [lists]);

  const invalidateArchive = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.card.listArchived.queryFilter({ boardId })),
    ]);
  };

  const listArchive = useMutation(
    trpc.list.archive.mutationOptions({
      onSuccess: invalidateArchive,
      onError: () => toast.error(copy.restoreFailed),
    }),
  );
  const cardArchive = useMutation(
    trpc.card.archive.mutationOptions({
      onSuccess: invalidateArchive,
      onError: () => toast.error(copy.restoreFailed),
    }),
  );
  const moveCard = useMutation(
    trpc.card.moveToList.mutationOptions({
      onSuccess: invalidateArchive,
      onError: () => toast.error(copy.restoreFailed),
    }),
  );

  const busy = listArchive.isPending || cardArchive.isPending || moveCard.isPending;
  const archivedCards = archivedCardsQuery.data ?? [];

  const restoreCard = (card: ArchivedCard) => {
    if (card.listArchivedAt == null) {
      cardArchive.mutate({
        cardId: card.id,
        archived: false,
        clientMutationId: crypto.randomUUID(),
      });
      return;
    }

    const toListId = targetByCardId[card.id] ?? activeLists[0]?.id;
    if (!toListId) return;
    moveCard.mutate(
      {
        cardId: card.id,
        toListId,
        clientMutationId: crypto.randomUUID(),
      },
      {
        onSuccess: () =>
          cardArchive.mutate({
            cardId: card.id,
            archived: false,
            clientMutationId: crypto.randomUUID(),
          }),
      },
    );
  };

  const errorMutation = listArchive.isError
    ? listArchive
    : cardArchive.isError
      ? cardArchive
      : moveCard.isError
        ? moveCard
        : null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-8', boardChromeButtonClass)}
              aria-label={copy.open}
            >
              <ArchiveIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{copy.open}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        className="max-h-[min(70vh,520px)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
      >
        <DropdownMenuLabel className="px-3 py-2">{copy.title}</DropdownMenuLabel>
        <div className="space-y-1 px-1 pb-1">
          <DropdownMenuCheckboxItem
            checked={showArchivedLists}
            onCheckedChange={() => onToggleArchivedLists()}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">{copy.showArchivedLists}</span>
            {archivedListCount > 0 && (
              <Badge variant="secondary" className="ml-auto" aria-hidden>
                {archivedListCount} {copy.archivedListCount}
              </Badge>
            )}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showArchivedCards}
            onCheckedChange={() => onToggleArchivedCards()}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">{copy.showArchivedCards}</span>
            {archivedCards.length > 0 && (
              <Badge variant="secondary" className="ml-auto" aria-hidden>
                {archivedCards.length} {copy.archivedCardCount}
              </Badge>
            )}
          </DropdownMenuCheckboxItem>
        </div>

        <DropdownMenuSeparator />
        <section className="space-y-2 p-3" aria-labelledby="archived-lists-title">
          <h2 id="archived-lists-title" className="text-xs font-semibold">
            {copy.listsTitle}
          </h2>
          {archivedLists.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
              {copy.noArchivedLists}
            </p>
          ) : (
            archivedLists.map((list) => (
              <div
                key={list.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ListIcon className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{list.title}</span>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      listArchive.mutate({
                        boardId,
                        listId: list.id,
                        archived: false,
                        clientMutationId: crypto.randomUUID(),
                      });
                    }}
                  >
                    <ArchiveRestoreIcon className="size-4" />
                    {copy.restore}
                  </Button>
                )}
              </div>
            ))
          )}
        </section>

        <DropdownMenuSeparator />
        <section className="space-y-2 p-3" aria-labelledby="archived-cards-title">
          <h2 id="archived-cards-title" className="text-xs font-semibold">
            {copy.cardsTitle}
          </h2>

          {archivedCardsQuery.isPending ? (
            <AppSpinner label={copy.cardsLoading} showLabel className="justify-start" />
          ) : archivedCardsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {archivedCardsQuery.error.message || strings.common.unknownError}
              </AlertDescription>
            </Alert>
          ) : archivedCards.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
              {copy.noArchivedCards}
            </p>
          ) : (
            archivedCards.map((card) => {
              const inArchivedList = card.listArchivedAt != null;
              const targetListId = targetByCardId[card.id] ?? activeLists[0]?.id ?? '';
              return (
                <div key={card.id} className="space-y-3 rounded-md border bg-card px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{card.title}</div>
                    <div className="text-muted-foreground truncate text-xs">{card.listTitle}</div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {inArchivedList && activeLists.length > 0 && (
                        <>
                          <label className="sr-only" htmlFor={`archive-target-${card.id}`}>
                            {copy.moveTargetLabel}
                          </label>
                          <select
                            id={`archive-target-${card.id}`}
                            value={targetListId}
                            onChange={(event) =>
                              setTargetByCardId((prev) => ({
                                ...prev,
                                [card.id]: event.target.value,
                              }))
                            }
                            onClick={(event) => event.stopPropagation()}
                            className="border-input bg-background h-8 w-40 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            {activeLists.map((list) => (
                              <option key={list.id} value={list.id}>
                                {list.title}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {inArchivedList && activeLists.length === 0 ? (
                        <span className="text-muted-foreground text-xs">{copy.noActiveLists}</span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || (inArchivedList && activeLists.length === 0)}
                          onClick={(event) => {
                            event.stopPropagation();
                            restoreCard(card);
                          }}
                        >
                          {inArchivedList ? (
                            <MoveRightIcon className="size-4" />
                          ) : (
                            <ArchiveRestoreIcon className="size-4" />
                          )}
                          {inArchivedList ? copy.moveAndRestore : copy.restore}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {errorMutation && (
            <Alert variant="destructive">
              <AlertDescription>{mutationMessage(errorMutation)}</AlertDescription>
            </Alert>
          )}
        </section>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
