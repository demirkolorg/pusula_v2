'use client';

import { useMemo } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { boardRoleAtLeast, type BoardRole, type CardRole, type LabelColor } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CardDetailActivity } from './card-detail-activity';
import { CardDetailChecklists, type ChecklistView } from './card-detail-checklists';
import { CardDetailComments } from './card-detail-comments';
import { CardDetailDescription } from './card-detail-description';
import { CardDetailDueDate } from './card-detail-due-date';
import { CardDetailLabels } from './card-detail-labels';
import { CardDetailMembers } from './card-detail-members';
import { CardDetailTitle } from './card-detail-title';

const cmid = () => crypto.randomUUID();

type CardDetailDialogProps = {
  boardId: string;
  cardId: string;
  /** The viewer's own user id (for self-watch + "you" badges + own-comment edits). */
  viewerUserId: string;
  /** Closes the modal — the route component drops the `?card` param. */
  onClose: () => void;
};

/**
 * Card detail modal. Opens on top of the board screen (`?card=<id>` in the URL,
 * managed by the route component). Fetches the card + its members / labels /
 * checklists / comments / activity (and the board's member & label lists for the
 * pickers) in parallel; renders inline-editable sections gated by the viewer's
 * board role. No optimistic UI this phase — every mutation `await`s and then
 * invalidates the affected queries (plus `board.get`, so the board screen's card
 * chip refreshes). Mutation errors surface inline per section. An invalid card id
 * (server `NOT_FOUND`) shows a "not found" alert + close.
 */
export function CardDetailDialog({ boardId, cardId, viewerUserId, onClose }: CardDetailDialogProps) {
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
    ],
  });
  const [cardQ, cardMembersQ, cardLabelsQ, checklistsQ, commentsQ, activityQ, boardMembersQ, boardLabelsQ] =
    queries;

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
  // Title / description / due-date each get their own `card.update` instance so
  // a failure (or in-flight state) in one section never leaks into the others.
  const updateTitle = useMutation(trpc.card.update.mutationOptions(onMutated));
  const updateDescription = useMutation(trpc.card.update.mutationOptions(onMutated));
  const updateDueAt = useMutation(trpc.card.update.mutationOptions(onMutated));
  const archiveCard = useMutation(trpc.card.archive.mutationOptions(onMutated));
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

  const errOf = (m: { isError: boolean; error: { message?: string } | null }): string | null =>
    m.isError ? m.error?.message || strings.common.unknownError : null;

  const card = cardQ.data?.card;
  const boardMembers = boardMembersQ.data ?? [];
  const cardMembers = cardMembersQ.data ?? [];

  const nameOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of boardMembers) map.set(m.userId, m.name);
    for (const m of cardMembers) if (!map.has(m.userId)) map.set(m.userId, m.name);
    return (userId: string) => map.get(userId);
  }, [boardMembers, cardMembers]);

  // Board role lives on `board.get` — but we only fetch `card.get` here. The
  // simplest reliable source is `board.members.list`, which includes the
  // viewer's effective role. (Falls back to `viewer` until that resolves.)
  const viewerBoardRole: BoardRole =
    (boardMembers.find((m) => m.userId === viewerUserId)?.role as BoardRole | undefined) ?? 'viewer';
  const archived = (card?.archivedAt ?? null) != null;
  const canEdit = boardRoleAtLeast(viewerBoardRole, 'member') && !archived;
  const isBoardAdmin = boardRoleAtLeast(viewerBoardRole, 'admin');

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  // --- Loading / error states ---------------------------------------------
  // Activity loads on its own — the section renders its own skeleton from
  // `pending` — so it must not hold the whole modal in the loading state.
  const isPending = queries.some((q) => q !== activityQ && q.isPending);
  const isNotFound =
    cardQ.isError &&
    (cardQ.error as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {isNotFound ? (
          <>
            <DialogHeader>
              <DialogTitle>{detailCopy.loadErrorTitle}</DialogTitle>
              <DialogDescription>{detailCopy.notFound}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                {detailCopy.close}
              </Button>
            </div>
          </>
        ) : cardQ.isError ? (
          <>
            <DialogHeader>
              <DialogTitle>{detailCopy.loadErrorTitle}</DialogTitle>
              <DialogDescription>
                {cardQ.error?.message || strings.common.unknownError}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                {detailCopy.close}
              </Button>
            </div>
          </>
        ) : isPending || !card ? (
          <>
            <DialogHeader>
              <DialogTitle>{strings.common.loading}</DialogTitle>
              <DialogDescription>{detailCopy.loading}</DialogDescription>
            </DialogHeader>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="sr-only">{card.title}</DialogTitle>
              <DialogDescription className="sr-only">{detailCopy.titleLabel}</DialogDescription>
              <CardDetailTitle
                title={card.title}
                canEdit={canEdit}
                onSave={(title) => updateTitle.mutate({ cardId, title, clientMutationId: cmid() })}
                pending={updateTitle.isPending}
                error={errOf(updateTitle)}
              />
              {archived && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{detailCopy.archivedNote}</Badge>
                </div>
              )}
            </DialogHeader>

            <div className="space-y-6">
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
                pending={addLabel.isPending || removeLabel.isPending || createLabel.isPending}
                error={errOf(addLabel) || errOf(removeLabel) || errOf(createLabel)}
              />

              <CardDetailMembers
                members={cardMembers}
                boardMembers={boardMembers.map((m) => ({ userId: m.userId, name: m.name }))}
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

              <CardDetailDescription
                description={card.description}
                canEdit={canEdit}
                onSave={(description) =>
                  updateDescription.mutate({ cardId, description, clientMutationId: cmid() })
                }
                pending={updateDescription.isPending}
                error={errOf(updateDescription)}
              />

              <CardDetailDueDate
                dueAt={card.dueAt}
                canEdit={canEdit}
                onSave={(dueAt) => updateDueAt.mutate({ cardId, dueAt, clientMutationId: cmid() })}
                pending={updateDueAt.isPending}
                error={errOf(updateDueAt)}
              />

              <CardDetailChecklists
                checklists={(checklistsQ.data ?? []) as ChecklistView[]}
                canEdit={canEdit}
                onCreateChecklist={(title) =>
                  createChecklist.mutate({ cardId, title, clientMutationId: cmid() })
                }
                onRenameChecklist={({ checklistId, title }) =>
                  renameChecklist.mutate({ cardId, checklistId, title, clientMutationId: cmid() })
                }
                onDeleteChecklist={(checklistId) =>
                  deleteChecklist.mutate({ cardId, checklistId, clientMutationId: cmid() })
                }
                onAddItem={({ checklistId, content }) =>
                  addItem.mutate({ cardId, checklistId, content, clientMutationId: cmid() })
                }
                onToggleItem={({ checklistId, itemId, completed }) =>
                  toggleItem.mutate({ cardId, checklistId, itemId, completed, clientMutationId: cmid() })
                }
                onEditItem={({ checklistId, itemId, content }) =>
                  editItem.mutate({ cardId, checklistId, itemId, content, clientMutationId: cmid() })
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

              <CardDetailComments
                comments={commentsQ.data ?? []}
                nameOf={nameOf}
                viewerUserId={viewerUserId}
                isBoardAdmin={isBoardAdmin}
                canComment={canEdit}
                onCreate={(body) => createComment.mutate({ cardId, body, clientMutationId: cmid() })}
                onEdit={({ commentId, body }) =>
                  editComment.mutate({ cardId, commentId, body, clientMutationId: cmid() })
                }
                onDelete={(commentId) =>
                  deleteComment.mutate({ cardId, commentId, clientMutationId: cmid() })
                }
                pending={createComment.isPending || editComment.isPending || deleteComment.isPending}
                error={errOf(createComment) || errOf(editComment) || errOf(deleteComment)}
              />

              <CardDetailActivity
                events={activityQ.data ?? []}
                pending={activityQ.isPending}
                error={
                  activityQ.isError
                    ? activityQ.error?.message || strings.common.unknownError
                    : null
                }
              />

              {/* Archive / restore */}
              {(canEdit || archived) && boardRoleAtLeast(viewerBoardRole, 'member') && (
                <div className="border-t pt-4">
                  {archived ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={archiveCard.isPending}
                      onClick={() =>
                        archiveCard.mutate({ cardId, archived: false, clientMutationId: cmid() })
                      }
                    >
                      {archiveCard.isPending ? detailCopy.restoring : detailCopy.restore}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={archiveCard.isPending}
                      onClick={() =>
                        archiveCard.mutate({ cardId, archived: true, clientMutationId: cmid() })
                      }
                    >
                      {archiveCard.isPending ? detailCopy.archiving : detailCopy.archive}
                    </Button>
                  )}
                  {archiveCard.isError && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTitle>{strings.common.unknownError}</AlertTitle>
                      <AlertDescription>
                        {archiveCard.error?.message || strings.common.unknownError}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
