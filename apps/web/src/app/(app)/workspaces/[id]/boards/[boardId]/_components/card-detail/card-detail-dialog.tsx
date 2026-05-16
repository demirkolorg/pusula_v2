'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  CARD_COVER_COLORS,
  CARD_COVER_IMAGE_MAX_BYTES,
  CARD_COVER_IMAGE_MIME_TYPES,
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
  type MentionSource,
} from '@pusula/ui';
import {
  applyCardArchive,
  applyCardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
  type CardDetailCache,
} from '@/lib/board-cache';
import { AppSpinner } from '@/components/app-spinner';
import { useShortcutScope } from '@/lib/shortcuts';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import type { CoverImage } from '../card-cover-image';
import { ShortcutHelpDialog } from '../shortcut-help-dialog';
import { CardDetailChecklists, type ChecklistView } from './card-detail-checklists';
import { CardDetailCoverColor } from './card-detail-cover-color';
import { CardDetailDescription } from './card-detail-description';
import { CardDetailDueDate } from './card-detail-due-date';
import { CardDetailLabels } from './card-detail-labels';
import { CardDetailMembers } from './card-detail-members';
import { CardDetailTitle } from './card-detail-title';
import { CardModalHeader } from './card-modal-header';
import { ShareDialog } from './share-dialog';
import { CardModalMetaChips, type CardModalMetaMenu } from './card-modal-meta-chips';
import { CardModalSidebar } from './card-modal-sidebar';

const cmid = () => crypto.randomUUID();

/** Narrow a server-supplied cover-colour string to the known palette set. */
function asCoverColor(value: string | null | undefined): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}

function asCoverImageMimeType(value: string) {
  return (CARD_COVER_IMAGE_MIME_TYPES as readonly string[]).includes(value)
    ? (value as (typeof CARD_COVER_IMAGE_MIME_TYPES)[number])
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
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [titleFocusToken, setTitleFocusToken] = useState(0);
  const [openMetaMenu, setOpenMetaMenu] = useState<CardModalMetaMenu>(null);
  const pendingCoverImageRef = useRef<CoverImage | null>(null);

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
      // Faz 11D (DEM-150) — attachment list drives the "Ekler" tab counter +
      // the cover-image picker; warm here so the sidebar/cover picker share
      // one cache entry. Loads on its own (not part of the modal gate).
      trpc.attachment.list.queryOptions({ cardId }),
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
    attachmentsQ,
  ] = queries;

  /**
   * Invalidate the per-card queries + the board screen's `board.get`.
   *
   * Faz 4 review fix (W3 DEM-80): `useCallback` ile sabit referans — `cardId`/
   * `boardId`/`queryClient`/`trpc` deps. Aksi halde her render yeni fonksiyon
   * üretirdi ve `useOptimisticBoardMutation` 7 ayrı instance'ın `useMutation`
   * options bag'ı her render yeniden init olurdu.
   */
  const invalidateCard = useCallback(async () => {
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
  }, [queryClient, trpc, cardId, boardId]);
  const onMutated = useMemo(() => ({ onSuccess: invalidateCard }), [invalidateCard]);

  // --- Mutations -----------------------------------------------------------
  // Title / description / due-date / cover-colour each get their own `card.update`
  // instance so a failure (or in-flight state) in one section never leaks into
  // the others. Complete / uncomplete / archive are separate procedures. All
  // seven flow through `useOptimisticBoardMutation` (Phase 4C — DEM-80) so
  // `board.get` + `card.get` flip immediately, rollback on error, CONFLICT
  // refetches; `invalidateCard` runs on success to refresh the dependent
  // per-card lists (members / labels / activity) the hook doesn't touch.
  //
  // Faz 4 review fix (W3 DEM-80): toast callback'leri `useCallback`'le
  // sabitlenir — `toast` import edilen modül fonksiyonu, stable; `strings`
  // sabit literal — deps boş. Bu, 7 mutation × `useMutation` options bag'ının
  // her parent render'da yeniden init edilmesini engeller.
  const onConflict = useCallback(() => toast(strings.board.conflict.refreshed), []);
  const onMutationError = useCallback(() => toast.error(strings.board.optimistic.error), []);
  const cardOnSuccess = useCallback(() => invalidateCard(), [invalidateCard]);

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
  const updateCoverImage = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId,
    apply: (data, vars) =>
      vars.coverImageAttachmentId === undefined
        ? data
        : applyCardPatch(data, vars.cardId, {
            coverImageAttachmentId: vars.coverImageAttachmentId,
            coverImage: pendingCoverImageRef.current,
          } as Partial<(typeof data.cards)[number]>),
    applyCardDetail: (data, vars) =>
      vars.coverImageAttachmentId === undefined
        ? data
        : {
            ...data,
            card: {
              ...data.card,
              coverImageAttachmentId: vars.coverImageAttachmentId,
              coverImage: pendingCoverImageRef.current,
            },
          },
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
  // Faz 11B (DEM-148) — cover image upload now uses the two-phase commit:
  // `initiate` reserves a draft row + presigned PUT, then `commit` stamps
  // `committed_at` + emits the audit / fan-out. The cover-image link uses the
  // committed row's id verbatim (legacy DEM-110 rows were backfilled by
  // migration `0027`).
  const initiateAttachment = useMutation(trpc.attachment.initiate.mutationOptions());
  const commitAttachment = useMutation(trpc.attachment.commit.mutationOptions());
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
  // Avatar URL resolver — mirrors `nameOf`, sourced from the same board/card
  // member lists (both queries now select `image`). Used by the comment rows,
  // checklist completer avatars and activity actor fallback.
  const imageOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of boardMembers) map.set(m.userId, m.image);
    for (const m of cardMembers) if (!map.has(m.userId)) map.set(m.userId, m.image);
    return (userId: string) => map.get(userId) ?? null;
  }, [boardMembers, cardMembers]);
  const viewerName = nameOf(viewerUserId) ?? null;
  // Viewer avatar — resolved from the board/card member lists (the viewer is
  // always a board member, so this carries the uploaded avatar when present).
  const viewerImage = imageOf(viewerUserId);

  // @-mention picker source: board members (incl. workspace-inherited admins),
  // filtered by query — self is excluded so users can't mention themselves.
  // Backend parser resolves `attrs.id` directly, so the chip is robust to name
  // collisions / renames. Memoised on the member list reference; the inner
  // function is stable across keystrokes.
  const mentionSource: MentionSource = useMemo(() => {
    const candidates = boardMembers
      .filter((m) => m.userId !== viewerUserId)
      .map((m) => ({ id: m.userId, label: (m.name ?? m.userId).trim() || m.userId }));
    return {
      search(query) {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return candidates;
        return candidates.filter((u) => u.label.toLowerCase().includes(q));
      },
      emptyLabel: strings.card.detail.composer.mentionEmpty,
    };
  }, [boardMembers, viewerUserId]);

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

  useShortcutScope({
    scope: 'card-modal',
    enabled: Boolean(card),
    bindings: [
      {
        id: 'card-help',
        match: (event) => event.key === '?' && !event.ctrlOrMeta && !event.alt,
        run: () => setShortcutHelpOpen(true),
      },
      {
        id: 'card-edit-title',
        match: (event) => event.key === 'e' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setTitleFocusToken((value) => value + 1);
        },
      },
      {
        id: 'card-toggle-complete',
        match: (event) => event.key === 'c' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (!canEdit || completePending) return;
          if (completed) uncompleteCard.mutate({ cardId });
          else completeCard.mutate({ cardId });
        },
      },
      {
        id: 'card-due',
        match: (event) => event.key === 'd' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setOpenMetaMenu('due');
        },
      },
      {
        id: 'card-members',
        match: (event) => event.key === 'm' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setOpenMetaMenu('members');
        },
      },
      {
        id: 'card-labels',
        match: (event) => event.key === 't' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setOpenMetaMenu('labels');
        },
      },
      {
        id: 'card-archive',
        match: (event) => event.key === 'a' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (!canArchive || archiveCard.isPending) return;
          archiveCard.mutate({ cardId, archived: !archived });
        },
      },
    ],
  });

  const uploadCoverImage = async (file: File) => {
    setCoverImageUploadError(null);
    const mimeType = asCoverImageMimeType(file.type);
    if (!mimeType) {
      setCoverImageUploadError(detailCopy.modal.coverImageUploadFailed);
      return;
    }
    if (file.size > CARD_COVER_IMAGE_MAX_BYTES) {
      setCoverImageUploadError(detailCopy.modal.coverImageTooLarge);
      return;
    }
    try {
      const initiated = await initiateAttachment.mutateAsync({
        cardId,
        fileName: file.name,
        mimeType,
        size: file.size,
        clientMutationId: cmid(),
      });
      // `initiated.upload.headers` carries both `content-type` and
      // `content-length` (Faz 11B — DEM-148 / security H1): the presigned URL
      // signs both, so the upload is rejected unless they match the request.
      // The browser sets `Content-Length` itself from `body` (and cannot be
      // overridden), keeping the signed size and the actual body in lock-step.
      const response = await fetch(initiated.upload.url, {
        method: 'PUT',
        headers: initiated.upload.headers,
        body: file,
      });
      if (!response.ok) throw new Error(detailCopy.modal.coverImageUploadFailed);

      const committed = await commitAttachment.mutateAsync({
        attachmentId: initiated.attachmentId,
        clientMutationId: cmid(),
      });
      pendingCoverImageRef.current = {
        attachmentId: committed.id,
        fileName: committed.fileName,
        mimeType: committed.mimeType,
        size: committed.size,
      };
      await updateCoverImage.mutateAsync({
        cardId,
        coverImageAttachmentId: committed.id,
      });
    } catch (err) {
      setCoverImageUploadError(
        err instanceof Error ? err.message : detailCopy.modal.coverImageUploadFailed,
      );
    } finally {
      pendingCoverImageRef.current = null;
    }
  };

  const clearCoverImage = () => {
    setCoverImageUploadError(null);
    pendingCoverImageRef.current = null;
    updateCoverImage.mutate({ cardId, coverImageAttachmentId: null });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  // --- Loading / error states ---------------------------------------------
  // Activity + attachments load on their own — the sidebar renders its own
  // skeleton — so they must not hold the whole modal in the loading state.
  const isPending = queries.some(
    (q) => q !== activityQ && q !== attachmentsQ && q.isPending,
  );
  const attachmentList = (attachmentsQ.data ?? []) as {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    kind: string | null;
    isCover: boolean;
  }[];
  const attachmentCount = attachmentList.length;
  // Image attachments are eligible cover images (Faz 11D — DEM-150).
  const coverImageOptions = useMemo(
    () =>
      attachmentList
        .filter((row) => row.kind === 'image')
        .map((row) => ({ id: row.id, fileName: row.fileName, isCover: row.isCover })),
    [attachmentList],
  );
  // Pick an existing committed image attachment as the cover. Re-uses the
  // `updateCoverImage` optimistic mutation; the picked row's metadata seeds
  // `pendingCoverImageRef` so the optimistic patch shows the photo at once.
  const selectCoverImageAttachment = useCallback(
    (attachmentId: string) => {
      const row = attachmentList.find((item) => item.id === attachmentId);
      setCoverImageUploadError(null);
      pendingCoverImageRef.current = row
        ? {
            attachmentId: row.id,
            fileName: row.fileName,
            mimeType: row.mimeType,
            size: row.size,
          }
        : null;
      updateCoverImage.mutate({ cardId, coverImageAttachmentId: attachmentId });
    },
    [attachmentList, cardId, updateCoverImage],
  );
  const isNotFound =
    cardQ.isError &&
    (cardQ.error as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex h-[85vh] max-h-[85vh] w-[min(1200px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0 lg:w-[70vw] sm:max-w-none',
          coverColor && !card?.coverImage && 'border-transparent',
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
            <DialogDescription asChild>
              <AppSpinner label={detailCopy.loading} showLabel className="justify-start" />
            </DialogDescription>
          </div>
        ) : (
          <>
            <DialogTitle className="sr-only">{card.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {detailCopy.modal.dialogTitle}
            </DialogDescription>

            <CardModalHeader
              cardId={cardId}
              boardName={boardTitle}
              listName={listTitle}
              coverImage={card.coverImage ?? null}
              coverColor={coverColor}
              archived={archived}
              canArchive={canArchive}
              archivePending={archiveCard.isPending}
              onArchiveToggle={(toArchived) => archiveCard.mutate({ cardId, archived: toArchived })}
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
                        next ? completeCard.mutate({ cardId }) : uncompleteCard.mutate({ cardId })
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
                        focusEditToken={titleFocusToken}
                      />
                    </div>
                    {/* Faz 9D (DEM-130) — kart paylaşım dialogu. Board admin/member
                        görür; viewer için `disabled` (server ayrıca FORBIDDEN döner). */}
                    <ShareDialog cardId={cardId} canShare={canEdit} />
                  </div>

                  {/* Meta chip row — members / due / labels / cover-colour each
                      open their picker in a dropdown. */}
                  <CardModalMetaChips
                    memberCount={cardMembers.length}
                    labelCount={(cardLabelsQ.data ?? []).length}
                    dueAt={card.dueAt}
                    coverColor={coverColor}
                    canEdit={canEdit}
                    openMenu={openMetaMenu}
                    onOpenMenuChange={setOpenMetaMenu}
                    membersContent={
                      <CardDetailMembers
                        members={cardMembers}
                        boardMembers={boardMembers.map((m) => ({
                          userId: m.userId,
                          name: m.name,
                          image: m.image,
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
                        coverImage={card.coverImage ?? null}
                        canEdit={canEdit}
                        onSelect={(next) => updateCoverColor.mutate({ cardId, coverColor: next })}
                        onImageSelect={uploadCoverImage}
                        onClearImage={clearCoverImage}
                        imageAttachments={coverImageOptions}
                        onCoverImageSelect={selectCoverImageAttachment}
                        pending={updateCoverColor.isPending}
                        imagePending={
                          initiateAttachment.isPending ||
                          commitAttachment.isPending ||
                          updateCoverImage.isPending
                        }
                        error={
                          coverImageUploadError ||
                          errOf(initiateAttachment) ||
                          errOf(commitAttachment) ||
                          errOf(updateCoverImage) ||
                          errOf(updateCoverColor)
                        }
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
                    onSave={(description) => updateDescription.mutate({ cardId, description })}
                    pending={updateDescription.isPending}
                    error={errOf(updateDescription)}
                  />

                  <CardDetailChecklists
                    checklists={(checklistsQ.data ?? []) as ChecklistView[]}
                    canEdit={canEdit}
                    nameOf={nameOf}
                    imageOf={imageOf}
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
                cardId={cardId}
                comments={commentsQ.data ?? []}
                activity={activityQ.data ?? []}
                activityPending={activityQ.isPending}
                attachmentCount={attachmentCount}
                activityError={
                  activityQ.isError ? activityQ.error?.message || strings.common.unknownError : null
                }
                nameOf={nameOf}
                imageOf={imageOf}
                viewerUserId={viewerUserId}
                viewerName={viewerName}
                viewerImage={viewerImage}
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
                mentions={mentionSource}
              />
            </div>
          </>
        )}
      </DialogContent>
      <ShortcutHelpDialog
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        includeCardModal
      />
    </Dialog>
  );
}
