'use client';

import { useMemo } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  CARD_COVER_COLORS,
  boardRoleAtLeast,
  type BoardRole,
  type CardCoverColor,
  type CardRole,
  type LabelColor,
} from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CardCompleteToggle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
  toast,
} from '@pusula/ui';
import {
  applyCardArchive,
  applyCardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
  type CardDetailCache,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CardDetailChecklists, type ChecklistView } from './card-detail-checklists';
import { CardDetailCoverColor } from './card-detail-cover-color';
import { CardDetailDescription } from './card-detail-description';
import { CardDetailDueDate } from './card-detail-due-date';
import { CardDetailLabels } from './card-detail-labels';
import { CardDetailMembers } from './card-detail-members';
import { CardDetailTitle } from './card-detail-title';
import { CardModalHeader } from './card-modal-header';
import { CardModalMetaChips } from './card-modal-meta-chips';
import { CardModalSidebar } from './card-modal-sidebar';

const cmid = () => crypto.randomUUID();

/** Narrow a server-supplied cover-colour string to the known palette set. */
function asCoverColor(value: string | null | undefined): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}

type CardDetailDialogProps = {
  boardId: string;
  cardId: string;
  /** The viewer's own user id (for self-watch + "you" badges + own-comment edits). */
  viewerUserId: string;
  /** Closes the modal — the route component drops the `?card` param. */
  onClose: () => void;
};

/**
 * Card detail modal — two-column layout over the board screen (`?card=<id>` in
 * the URL; `w-[min(960px,92vw)]` × `[1fr_360px]` per §13.3). Left column: a
 * sticky header (the "card done" toggle + the inline-editable title) and a meta
 * chip row (members / due / labels / cover-colour each opening their picker
 * below), then description + checklists. Right column: the comments + activity
 * sidebar. Fetches the card + its members / labels / checklists / comments /
 * activity (and the board's member & label lists for the pickers, plus
 * `board.get` for the breadcrumb — all cache-warm from the board screen) in
 * parallel; edits are gated by the viewer's board role. No optimistic UI this
 * phase — every mutation `await`s then invalidates the affected queries (plus
 * `board.get`, so the board screen's card chip refreshes). Mutation errors
 * surface inline per section. An invalid card id (server `NOT_FOUND`) shows a
 * "not found" alert + close.
 */
export function CardDetailDialog({
  boardId,
  cardId,
  viewerUserId,
  onClose,
}: CardDetailDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const detailCopy = strings.card.detail;

  const queries = useQueries({
    queries: [
      trpc.card.get.queryOptions({ cardId }),
      trpc.card.members.list.queryOptions({ cardId }),
      trpc.card.labels.list.queryOptions({ cardId }),
      trpc.checklist.list.queryOptions({ cardId }),
      trpc.comment.list.queryOptions({ cardId }),
      trpc.card.activity.list.queryOptions({ cardId }),
      trpc.board.members.list.queryOptions({ boardId }),
      trpc.label.list.queryOptions({ boardId }),
      trpc.board.get.queryOptions({ boardId }),
    ],
  });
  const [
    cardQ,
    cardMembersQ,
    cardLabelsQ,
    checklistsQ,
    commentsQ,
    activityQ,
    boardMembersQ,
    boardLabelsQ,
    boardQ,
  ] = queries;

  /** Invalidate the per-card queries + the board screen's `board.get`. */
  const invalidateCard = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.card.get.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.card.members.list.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.card.labels.list.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.comment.list.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId })),
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.members.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.label.list.queryFilter({ boardId })),
    ]);
  };
  const onMutated = { onSuccess: invalidateCard };

  // --- Mutations -----------------------------------------------------------
  // Title / description / due-date / cover-colour each get their own `card.update`
  // instance so a failure (or in-flight state) in one section never leaks into
  // the others. Complete / uncomplete / archive are separate procedures. All
  // seven flow through `useOptimisticBoardMutation` (Phase 4C — DEM-80) so
  // `board.get` + `card.get` flip immediately, rollback on error, CONFLICT
  // refetches; `invalidateCard` runs on success to refresh the dependent
  // per-card lists (members / labels / activity) the hook doesn't touch.
  const onConflict = () => toast(strings.board.conflict.refreshed);
  const onMutationError = () => toast.error(strings.board.optimistic.error);
  const cardOnSuccess = () => invalidateCard();

  const updateTitle = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) =>
      vars.title == null ? data : applyCardPatch(data, vars.cardId, { title: vars.title }),
    applyCardDetail: (data: CardDetailCache, vars) =>
      vars.title == null ? data : { ...data, card: { ...data.card, title: vars.title } },
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const updateDescription = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) =>
      vars.description === undefined
        ? data
        : applyCardPatch(data, vars.cardId, { description: vars.description }),
    applyCardDetail: (data, vars) =>
      vars.description === undefined
        ? data
        : { ...data, card: { ...data.card, description: vars.description } },
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const updateDueAt = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) =>
      vars.dueAt === undefined
        ? data
        : applyCardPatch(data, vars.cardId, { dueAt: vars.dueAt as Date | null }),
    applyCardDetail: (data, vars) =>
      vars.dueAt === undefined
        ? data
        : { ...data, card: { ...data.card, dueAt: vars.dueAt as Date | null } },
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const updateCoverColor = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) =>
      vars.coverColor === undefined
        ? data
        : applyCardPatch(data, vars.cardId, { coverColor: vars.coverColor }),
    applyCardDetail: (data, vars) =>
      vars.coverColor === undefined
        ? data
        : { ...data, card: { ...data.card, coverColor: vars.coverColor } },
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const completeCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.complete.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: true }),
    applyCardDetail: (data) => ({ ...data, card: { ...data.card, completed: true } }),
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const uncompleteCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.uncomplete.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: false }),
    applyCardDetail: (data) => ({ ...data, card: { ...data.card, completed: false } }),
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const archiveCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.archive.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) => (vars.archived ? applyCardArchive(data, vars.cardId) : data),
    applyCardDetail: (data, vars) => ({
      ...data,
      card: { ...data.card, archivedAt: vars.archived ? new Date() : null },
    }),
    onConflict,
    onMutationError,
    onMutationSuccess: cardOnSuccess,
  });
  const addMember = useMutation(trpc.card.members.add.mutationOptions(onMutated));
  const removeMember = useMutation(trpc.card.members.remove.mutationOptions(onMutated));
  const addLabel = useMutation(trpc.card.labels.add.mutationOptions(onMutated));
  const removeLabel = useMutation(trpc.card.labels.remove.mutationOptions(onMutated));
  const createLabel = useMutation(trpc.label.create.mutationOptions(onMutated));
  const createChecklist = useMutation(trpc.checklist.create.mutationOptions(onMutated));
  const renameChecklist = useMutation(trpc.checklist.update.mutationOptions(onMutated));
  const deleteChecklist = useMutation(trpc.checklist.delete.mutationOptions(onMutated));
  const addItem = useMutation(trpc.checklist.item.create.mutationOptions(onMutated));
  const toggleItem = useMutation(trpc.checklist.item.toggle.mutationOptions(onMutated));
  const editItem = useMutation(trpc.checklist.item.update.mutationOptions(onMutated));
  const deleteItem = useMutation(trpc.checklist.item.delete.mutationOptions(onMutated));
  const createComment = useMutation(trpc.comment.create.mutationOptions(onMutated));
  const editComment = useMutation(trpc.comment.update.mutationOptions(onMutated));
  const deleteComment = useMutation(trpc.comment.delete.mutationOptions(onMutated));

  const errOf = (m: { isError: boolean; error: unknown }): string | null =>
    m.isError ? (getMutationErrorMessage(m) ?? strings.common.unknownError) : null;

  const card = cardQ.data?.card;
  const boardMembers = boardMembersQ.data ?? [];
  const cardMembers = cardMembersQ.data ?? [];

  const nameOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of boardMembers) map.set(m.userId, m.name);
    for (const m of cardMembers) if (!map.has(m.userId)) map.set(m.userId, m.name);
    return (userId: string) => map.get(userId);
  }, [boardMembers, cardMembers]);
  const viewerName = nameOf(viewerUserId) ?? null;

  // Board role lives on `board.get` — but we lean on `board.members.list`, which
  // includes the viewer's effective role. (Falls back to `viewer` until it resolves.)
  const viewerBoardRole: BoardRole =
    (boardMembers.find((m) => m.userId === viewerUserId)?.role as BoardRole | undefined) ??
    'viewer';
  const archived = (card?.archivedAt ?? null) != null;
  const canEdit = boardRoleAtLeast(viewerBoardRole, 'member') && !archived;
  const isBoardAdmin = boardRoleAtLeast(viewerBoardRole, 'admin');
  const canArchive = boardRoleAtLeast(viewerBoardRole, 'member');

  const boardTitle = boardQ.data?.board.title ?? null;
  const listTitle = useMemo(() => {
    if (!card) return null;
    return boardQ.data?.lists.find((l) => l.id === card.listId)?.title ?? null;
  }, [boardQ.data, card]);

  const coverColor = asCoverColor(card?.coverColor);
  const completed = card?.completed ?? false;
  const completePending = completeCard.isPending || uncompleteCard.isPending;
  const completeError = errOf(completeCard) || errOf(uncompleteCard);

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  // --- Loading / error states ---------------------------------------------
  // Activity loads on its own — the sidebar renders its own skeleton from
  // `pending` — so it must not hold the whole modal in the loading state.
  const isPending = queries.some((q) => q !== activityQ && q.isPending);
  const isNotFound =
    cardQ.isError &&
    (cardQ.error as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex h-[85vh] max-h-[85vh] w-[min(1200px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0 lg:w-[70vw] sm:max-w-none',
          coverColor && 'border-transparent',
        )}
        showCloseButton={false}
      >
        {isNotFound || cardQ.isError ? (
          <div className="space-y-4 p-6">
            <DialogTitle>{detailCopy.loadErrorTitle}</DialogTitle>
            <DialogDescription>
              {isNotFound
                ? detailCopy.notFound
                : cardQ.error?.message || strings.common.unknownError}
            </DialogDescription>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                {detailCopy.close}
              </Button>
            </div>
          </div>
        ) : isPending || !card ? (
          <div className="space-y-2 p-6">
            <DialogTitle>{strings.common.loading}</DialogTitle>
            <DialogDescription>{detailCopy.loading}</DialogDescription>
          </div>
        ) : (
          <>
            <DialogTitle className="sr-only">{card.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {detailCopy.modal.dialogTitle}
            </DialogDescription>

            <CardModalHeader
              boardName={boardTitle}
              listName={listTitle}
              coverColor={coverColor}
              archived={archived}
              canArchive={canArchive}
              archivePending={archiveCard.isPending}
              onArchiveToggle={(toArchived) =>
                archiveCard.mutate({ cardId, archived: toArchived })
              }
              onClose={onClose}
            />

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_360px]">
              {/* Left column ------------------------------------------------ */}
              <div className="min-h-0 min-w-0 overflow-y-auto">
                <div className="sticky top-0 z-10 min-w-0 space-y-2 bg-background px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <CardCompleteToggle
                      checked={completed}
                      alwaysVisible
                      disabled={!canEdit || completePending}
                      aria-label={
                        completed
                          ? detailCopy.modal.completeUntoggle
                          : detailCopy.modal.completeToggle
                      }
                      onCheckedChange={(next) =>
                        next
                          ? completeCard.mutate({ cardId })
                          : uncompleteCard.mutate({ cardId })
                      }
                      className="mt-1.5"
                    />
                    <div className="min-w-0 flex-1">
                      <CardDetailTitle
                        title={card.title}
                        completed={completed}
                        canEdit={canEdit}
                        onSave={(title) => updateTitle.mutate({ cardId, title })}
                        pending={updateTitle.isPending}
                        error={errOf(updateTitle)}
                      />
                    </div>
                  </div>

                  {/* Meta chip row — members / due / labels / cover-colour each
                      open their picker in a dropdown. */}
                  <CardModalMetaChips
                    memberCount={cardMembers.length}
                    labelCount={(cardLabelsQ.data ?? []).length}
                    dueAt={card.dueAt}
                    coverColor={coverColor}
                    canEdit={canEdit}
                    membersContent={
                      <CardDetailMembers
                        members={cardMembers}
                        boardMembers={boardMembers.map((m) => ({
                          userId: m.userId,
                          name: m.name,
                        }))}
                        viewerUserId={viewerUserId}
                        canEdit={canEdit}
                        onAdd={(input: { userId: string; role: CardRole }) =>
                          addMember.mutate({ cardId, ...input, clientMutationId: cmid() })
                        }
                        onRemove={(input: { userId: string; role: CardRole }) =>
                          removeMember.mutate({ cardId, ...input, clientMutationId: cmid() })
                        }
                        pending={addMember.isPending || removeMember.isPending}
                        error={errOf(addMember) || errOf(removeMember)}
                      />
                    }
                    dueContent={
                      <CardDetailDueDate
                        dueAt={card.dueAt}
                        canEdit={canEdit}
                        onSave={(dueAt) => updateDueAt.mutate({ cardId, dueAt })}
                        pending={updateDueAt.isPending}
                        error={errOf(updateDueAt)}
                      />
                    }
                    labelsContent={
                      <CardDetailLabels
                        cardLabels={cardLabelsQ.data ?? []}
                        boardLabels={boardLabelsQ.data ?? []}
                        canEdit={canEdit}
                        onAdd={(labelId) =>
                          addLabel.mutate({ cardId, labelId, clientMutationId: cmid() })
                        }
                        onRemove={(labelId) =>
                          removeLabel.mutate({ cardId, labelId, clientMutationId: cmid() })
                        }
                        onCreate={(input: { color: LabelColor; name?: string }) =>
                          createLabel.mutate({ boardId, ...input, clientMutationId: cmid() })
                        }
                        pending={
                          addLabel.isPending || removeLabel.isPending || createLabel.isPending
                        }
                        error={errOf(addLabel) || errOf(removeLabel) || errOf(createLabel)}
                      />
                    }
                    coverContent={
                      <CardDetailCoverColor
                        coverColor={coverColor}
                        canEdit={canEdit}
                        onSelect={(next) =>
                          updateCoverColor.mutate({ cardId, coverColor: next })
                        }
                        pending={updateCoverColor.isPending}
                        error={errOf(updateCoverColor)}
                      />
                    }
                  />
                </div>

                <div className="flex flex-col gap-[22px] px-4 pb-4 sm:px-6 sm:pb-5">
                  {completeError && (
                    <Alert variant="destructive">
                      <AlertDescription>{completeError}</AlertDescription>
                    </Alert>
                  )}

                  {archiveCard.isError && (
                    <Alert variant="destructive">
                      <AlertTitle>{strings.common.unknownError}</AlertTitle>
                      <AlertDescription>
                        {errOf(archiveCard) ?? strings.common.unknownError}
                      </AlertDescription>
                    </Alert>
                  )}

                  <CardDetailDescription
                    description={card.description}
                    canEdit={canEdit}
                    onSave={(description) =>
                      updateDescription.mutate({ cardId, description })
                    }
                    pending={updateDescription.isPending}
                    error={errOf(updateDescription)}
                  />

                  <CardDetailChecklists
                    checklists={(checklistsQ.data ?? []) as ChecklistView[]}
                    canEdit={canEdit}
                    nameOf={nameOf}
                    onCreateChecklist={(title) =>
                      createChecklist.mutate({ cardId, title, clientMutationId: cmid() })
                    }
                    onRenameChecklist={({ checklistId, title }) =>
                      renameChecklist.mutate({
                        cardId,
                        checklistId,
                        title,
                        clientMutationId: cmid(),
                      })
                    }
                    onDeleteChecklist={(checklistId) =>
                      deleteChecklist.mutate({ cardId, checklistId, clientMutationId: cmid() })
                    }
                    onAddItem={({ checklistId, content }) =>
                      addItem.mutate({ cardId, checklistId, content, clientMutationId: cmid() })
                    }
                    onToggleItem={({ checklistId, itemId, completed: itemCompleted }) =>
                      toggleItem.mutate({
                        cardId,
                        checklistId,
                        itemId,
                        completed: itemCompleted,
                        clientMutationId: cmid(),
                      })
                    }
                    onEditItem={({ checklistId, itemId, content }) =>
                      editItem.mutate({
                        cardId,
                        checklistId,
                        itemId,
                        content,
                        clientMutationId: cmid(),
                      })
                    }
                    onDeleteItem={({ checklistId, itemId }) =>
                      deleteItem.mutate({ cardId, checklistId, itemId, clientMutationId: cmid() })
                    }
                    pending={
                      createChecklist.isPending ||
                      renameChecklist.isPending ||
                      deleteChecklist.isPending ||
                      addItem.isPending ||
                      toggleItem.isPending ||
                      editItem.isPending ||
                      deleteItem.isPending
                    }
                    error={
                      errOf(createChecklist) ||
                      errOf(renameChecklist) ||
                      errOf(deleteChecklist) ||
                      errOf(addItem) ||
                      errOf(toggleItem) ||
                      errOf(editItem) ||
                      errOf(deleteItem)
                    }
                  />
                </div>
              </div>

              {/* Right panel ------------------------------------------------ */}
              <CardModalSidebar
                comments={commentsQ.data ?? []}
                activity={activityQ.data ?? []}
                activityPending={activityQ.isPending}
                activityError={
                  activityQ.isError ? activityQ.error?.message || strings.common.unknownError : null
                }
                nameOf={nameOf}
                viewerUserId={viewerUserId}
                viewerName={viewerName}
                isBoardAdmin={isBoardAdmin}
                canComment={canEdit}
                onCreateComment={(body) =>
                  createComment.mutate({ cardId, body, clientMutationId: cmid() })
                }
                onEditComment={({ commentId, body }) =>
                  editComment.mutate({ cardId, commentId, body, clientMutationId: cmid() })
                }
                onDeleteComment={(commentId) =>
                  deleteComment.mutate({ cardId, commentId, clientMutationId: cmid() })
                }
                commentPending={
                  createComment.isPending || editComment.isPending || deleteComment.isPending
                }
                commentError={errOf(createComment) || errOf(editComment) || errOf(deleteComment)}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
