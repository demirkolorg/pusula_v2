'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { listTitleSchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AddCardForm } from './add-card-form';
import { CardItem, type BoardCard } from './card-item';

export type BoardList = {
  id: string;
  title: string;
  position: string;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ListColumnProps = {
  boardId: string;
  list: BoardList;
  cards: BoardCard[];
  /**
   * Whether the viewer may edit content on this board (board `member+` and the
   * board itself is active). An archived *list* is still read-only even when
   * this is true — handled below.
   */
  canEdit: boolean;
};

/** Fixed-width board column for a single list: header (rename / archive) + cards + add-card form. */
export function ListColumn({ boardId, list, cards, canEdit }: ListColumnProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const renameId = useId();
  const columnCopy = strings.board.column;
  const cardCopy = strings.board.card;

  const listArchived = list.archivedAt != null;
  // An archived list never accepts mutations, even if the viewer could otherwise edit.
  const listEditable = canEdit && !listArchived;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => setRenameValue(list.title), [list.title]);

  const renameList = useMutation(
    trpc.list.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        setRenaming(false);
      },
    }),
  );

  const archiveList = useMutation(
    trpc.list.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        setArchiveOpen(false);
      },
    }),
  );

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
      },
    }),
  );

  const startRenaming = () => {
    setRenameValue(list.title);
    setRenameError(null);
    renameList.reset();
    setRenaming(true);
  };

  const cancelRenaming = () => {
    setRenameValue(list.title);
    setRenameError(null);
    renameList.reset();
    setRenaming(false);
  };

  const handleRenameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = listTitleSchema.safeParse(renameValue);
    if (!parsed.success) {
      setRenameError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setRenameError(null);
    if (parsed.data === list.title) {
      setRenaming(false);
      return;
    }
    renameList.mutate({
      boardId,
      listId: list.id,
      title: parsed.data,
      clientMutationId: crypto.randomUUID(),
    });
  };

  const handleArchiveOpenChange = (next: boolean) => {
    if (archiveList.isPending) return;
    setArchiveOpen(next);
    if (!next) archiveList.reset();
  };

  return (
    <section
      className={cn(
        'bg-muted/40 flex w-72 shrink-0 flex-col gap-3 rounded-md border p-3',
        listArchived && 'opacity-60',
      )}
      aria-label={list.title}
    >
      <header className="space-y-1">
        {renaming ? (
          <form onSubmit={handleRenameSubmit} noValidate className="space-y-2">
            <Input
              id={renameId}
              name="listTitle"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={columnCopy.renamePlaceholder}
              aria-label={columnCopy.renamePlaceholder}
              disabled={renameList.isPending}
              autoComplete="off"
              aria-invalid={renameError || renameList.isError ? true : undefined}
              aria-describedby={renameError ? `${renameId}-error` : undefined}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={renameList.isPending}>
                {renameList.isPending ? columnCopy.renameSaving : columnCopy.renameSave}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelRenaming}
                disabled={renameList.isPending}
              >
                {strings.common.cancel}
              </Button>
            </div>
            {renameError && (
              <p id={`${renameId}-error`} className="text-destructive text-sm">
                {renameError}
              </p>
            )}
            {!renameError && renameList.isError && (
              <p className="text-destructive text-sm">
                {renameList.error.message || strings.common.unknownError}
              </p>
            )}
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {listEditable ? (
              <button
                type="button"
                onClick={startRenaming}
                className="hover:text-primary flex-1 text-left text-sm font-semibold break-words"
              >
                {list.title}
              </button>
            ) : (
              <h2 className="flex-1 text-sm font-semibold break-words">{list.title}</h2>
            )}
            {canEdit && (
              <Dialog open={archiveOpen} onOpenChange={handleArchiveOpenChange}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={listArchived ? columnCopy.restore : columnCopy.archive}
                  >
                    {listArchived ? columnCopy.restore : columnCopy.archive}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {listArchived ? columnCopy.restore : columnCopy.archiveConfirmTitle}
                    </DialogTitle>
                    <DialogDescription>
                      {listArchived ? list.title : columnCopy.archiveConfirmDescription}
                    </DialogDescription>
                  </DialogHeader>
                  {archiveList.isError && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {archiveList.error.message || strings.common.unknownError}
                      </AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={archiveList.isPending}>
                        {strings.common.cancel}
                      </Button>
                    </DialogClose>
                    <Button
                      type="button"
                      variant={listArchived ? 'default' : 'destructive'}
                      disabled={archiveList.isPending}
                      onClick={() =>
                        archiveList.mutate({
                          boardId,
                          listId: list.id,
                          archived: !listArchived,
                          clientMutationId: crypto.randomUUID(),
                        })
                      }
                    >
                      {archiveList.isPending
                        ? listArchived
                          ? columnCopy.restoring
                          : columnCopy.archiving
                        : listArchived
                          ? columnCopy.restore
                          : columnCopy.archiveConfirm}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
        {listArchived && (
          <Badge variant="outline" className="text-xs">
            {columnCopy.archivedLabel}
          </Badge>
        )}
      </header>

      <div className="flex flex-col gap-2">
        {cards.length === 0 ? (
          <p className="text-muted-foreground text-sm">{columnCopy.empty}</p>
        ) : (
          cards.map((card) => (
            <CardItem key={card.id} boardId={boardId} card={card} canEdit={listEditable} />
          ))
        )}
      </div>

      {listEditable && (
        <div className="border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">{cardCopy.addCard}</p>
          <AddCardForm
            onSubmit={(title) =>
              createCard.mutate({ listId: list.id, title, clientMutationId: crypto.randomUUID() })
            }
            pending={createCard.isPending}
            error={createCard.isError ? createCard.error.message || strings.common.unknownError : null}
          />
        </div>
      )}
    </section>
  );
}
