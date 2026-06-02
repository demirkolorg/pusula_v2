'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlusIcon } from 'lucide-react';
import { Button, EmptyState, type MentionSource } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { getMutationErrorMessage } from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CardCommentComposer, CardDetailComments, type CommentView } from './card-detail-comments';

/** Per-mutation idempotency token — mirrors the card-comment wiring in the dialog. */
const cmid = () => crypto.randomUUID();

type ChecklistItemThreadProps = {
  cardId: string;
  checklistItemId: string;
  /** Board `member+` and board active — may add / edit / delete own comments. */
  canComment: boolean;
  /** Whether the viewer is a board `admin` (may edit/delete others' comments). */
  isBoardAdmin: boolean;
  viewerUserId: string;
  viewerName: string | null;
  viewerImage?: string | null;
  /** Resolve a user id to a display name (board/card members). */
  nameOf: (userId: string) => string | null | undefined;
  /** Resolve a user id to an avatar URL (board/card members; `null` when unset). */
  imageOf?: (userId: string) => string | null;
  /** Optional @-mention picker source (board members) for composer + inline edit. */
  mentions?: MentionSource;
};

/**
 * Inline comment thread for a single checklist item — self-fetching client
 * component mounted under {@link ChecklistItemRow} when its toggle is open.
 *
 * Re-uses the card's {@link CardCommentComposer} + {@link CardDetailComments}
 * presentationals, just scoped to one `checklistItemId`. The mutation wiring
 * mirrors the card-level comments in `card-detail-dialog.tsx`: plain mutations
 * with a `clientMutationId` per call, invalidate-on-success (no optimistic
 * patch this phase; the realtime echo is ignored via `clientMutationId`). On
 * every create/delete we also invalidate `checklist.list({ cardId })` so the
 * row's comment-count badge re-derives from the server.
 *
 * Read-only viewers may open + read the thread; `canComment=false` hides the
 * composer and the per-row edit/delete affordances (handled inside
 * {@link CardDetailComments}).
 */
export function ChecklistItemThread({
  cardId,
  checklistItemId,
  canComment,
  isBoardAdmin,
  viewerUserId,
  viewerName,
  viewerImage = null,
  nameOf,
  imageOf,
  mentions,
}: ChecklistItemThreadProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.card.checklist;

  // Composer varsayılan kapalı — thread açıldığında önce mevcut yorumlar görünür,
  // "Yorum yap" butonuyla istenince açılır (gereksiz kalabalık olmasın).
  const [composerOpen, setComposerOpen] = useState(false);

  const commentsQuery = useQuery(
    trpc.comment.list.queryOptions({ cardId, checklistItemId }),
  );

  // Invalidate this item's thread (so the new/edited/deleted row appears) plus
  // the checklist list (so the row badge's `commentCount` refreshes). Stable
  // across renders — fed straight into the mutation `onSuccess` callbacks.
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        trpc.comment.list.queryFilter({ cardId, checklistItemId }),
      ),
      queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId })),
    ]);
  }, [queryClient, trpc, cardId, checklistItemId]);

  const onSuccess = { onSuccess: invalidate } as const;
  const createComment = useMutation(trpc.comment.create.mutationOptions(onSuccess));
  const editComment = useMutation(trpc.comment.update.mutationOptions(onSuccess));
  const deleteComment = useMutation(trpc.comment.delete.mutationOptions(onSuccess));

  const pending = createComment.isPending || editComment.isPending || deleteComment.isPending;
  const errOf = (m: { isError: boolean; error: unknown }): string | null =>
    m.isError ? (getMutationErrorMessage(m) ?? strings.common.unknownError) : null;
  const error = errOf(createComment) || errOf(editComment) || errOf(deleteComment);

  const comments = (commentsQuery.data ?? []) as CommentView[];
  const commentsNewestFirst = [...comments].sort(
    (a, b) => timeOf(b.createdAt) - timeOf(a.createdAt),
  );

  return (
    <div
      // Sol kenar çizgisi + hafif girinti: thread'in maddeye ait olduğunu
      // görsel olarak bağlar; kart yorum bölümünden daha kompakt.
      className="border-border/60 ml-1.5 mt-2 space-y-2.5 border-l-2 pl-3"
      aria-label={copy.itemCommentsThreadLabel}
    >
      {canComment &&
        (composerOpen ? (
          <CardCommentComposer
            viewerName={viewerName}
            viewerImage={viewerImage}
            onSubmit={(body) => {
              createComment.mutate({ cardId, checklistItemId, body, clientMutationId: cmid() });
              setComposerOpen(false);
            }}
            pending={createComment.isPending}
            error={errOf(createComment)}
            mentions={mentions}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setComposerOpen(true)}
          >
            <MessageSquarePlusIcon className="size-3.5" aria-hidden />
            {copy.itemCommentsCompose}
          </Button>
        ))}

      {commentsQuery.isPending ? (
        <AppSpinner label={strings.common.loading} className="justify-start py-2" />
      ) : commentsQuery.isError ? (
        <EmptyState message={commentsQuery.error?.message || strings.common.unknownError} />
      ) : (
        <CardDetailComments
          comments={commentsNewestFirst}
          nameOf={nameOf}
          imageOf={imageOf}
          viewerUserId={viewerUserId}
          isBoardAdmin={isBoardAdmin}
          canComment={canComment}
          onEdit={({ commentId, body }) =>
            editComment.mutate({ cardId, commentId, body, clientMutationId: cmid() })
          }
          onDelete={(commentId) =>
            deleteComment.mutate({ cardId, commentId, clientMutationId: cmid() })
          }
          pending={pending}
          error={error}
          mentions={mentions}
        />
      )}
    </div>
  );
}

function timeOf(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}
