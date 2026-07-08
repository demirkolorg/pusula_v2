'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { ChevronDownIcon, ChevronUpIcon, PaperclipIcon } from 'lucide-react';
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
import { friendlyErrorMessage } from '@/lib/error-message';
import { useShortcutScope } from '@/lib/shortcuts';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import type { CoverImage } from '../card-cover-image';
import { ShortcutHelpDialog } from '../shortcut-help-dialog';
import { CardAttachmentAddForm } from './card-attachment-add-form';
import { CardDetailAttachments } from './card-detail-attachments';
import { CardDetailChecklists, type ChecklistView } from './card-detail-checklists';
import { CardDetailCoverColor } from './card-detail-cover-color';
import { CardDetailDescription } from './card-detail-description';
import { CardDetailDueDate } from './card-detail-due-date';
import { CardDetailLabels } from './card-detail-labels';
import { CardDetailMembers } from './card-detail-members';
import { CardDetailTitle } from './card-detail-title';
import { CardModalAddPopover, type CardAddView } from './card-modal-add-popover';
import { CardModalHeader } from './card-modal-header';
import { CardModalMetaInfo } from './card-modal-meta-info';
import { CardModalSidebar, type CardSidebarTab } from './card-modal-sidebar';
import { useTargetFlash } from './use-target-flash';

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
  /**
   * Notification deep-link focus targets (notification-link.ts → card-detail-route).
   * At most one is set; the modal scrolls the matching in-card item into view and
   * plays a one-shot flash once its data has loaded. A comment / attachment target
   * also forces the sidebar open on the right tab.
   */
  highlightCommentId?: string | null;
  highlightChecklistItemId?: string | null;
  highlightAttachmentId?: string | null;
  /** Sidebar tab the deep-link wants open (`comments` / `attachments`). */
  initialTab?: string | null;
  /** Closes the modal — the route component drops the `?card` + focus params. */
  onClose: () => void;
};

/** Narrow an arbitrary `?tab=` string to a known sidebar tab, else `null`. */
function asSidebarTab(value: string | null | undefined): CardSidebarTab | null {
  return value === 'comments' || value === 'activity' ? value : null;
}

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
  highlightCommentId,
  highlightChecklistItemId,
  highlightAttachmentId,
  initialTab,
  onClose,
}: CardDetailDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const detailCopy = strings.card.detail;
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [titleFocusToken, setTitleFocusToken] = useState(0);
  const [addMenu, setAddMenu] = useState<CardAddView | null>(null);
  // Deep-link ile gelen yorum hedefi sidebar'ı açar; ek hedefi (2026-07-05
  // sonrası) sol kolon altındaki EKLER galerisini açar; checklist maddesi hedefi
  // sol sütundadır (ikisi de sidebar gerektirmez). `useState` başlangıç değeri
  // sabit prop'tan türetilir — bir kez; modal aynı kart için yeniden açılırsa
  // route yeni bir dialog mount eder (cardId/key değişir), state taze başlar.
  const requestedTab = asSidebarTab(initialTab);
  const deepLinkWantsSidebar = Boolean(highlightCommentId) || requestedTab != null;
  // Ek deep-link'i (bildirim → ek) galeriyi açılışta açar; `initialTab` geriye
  // dönük olarak eski `attachments` değeriyle de gelebilir.
  const deepLinkWantsAttachments =
    Boolean(highlightAttachmentId) || initialTab === 'attachments';
  const [sidebarOpen, setSidebarOpen] = useState(deepLinkWantsSidebar);
  const [sidebarTab, setSidebarTab] = useState<CardSidebarTab>(requestedTab ?? 'comments');
  const [attachmentsOpen, setAttachmentsOpen] = useState(deepLinkWantsAttachments);
  // Kontrol listesinde bir madde detayı açık mı — açıksa açıklama paneli gizlenip
  // kontrol listesi tam genişliğe yayılır ("odaklanınca genişlet").
  const [checklistFocused, setChecklistFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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
            // DEM-227 — presigned URL server'da üretilir; optimistic anda yok.
            // `card.get`/`board.get` invalidate'i (cardOnSuccess) gerçek URL'i
            // getirir. O ana kadar kapak şeridi spinner/boş kalır.
            coverImageUrl: null,
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
              coverImageUrl: null,
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
  const archiveChecklist = useMutation(trpc.checklist.archive.mutationOptions(onMutated));
  const addItem = useMutation(trpc.checklist.item.create.mutationOptions(onMutated));
  const toggleItem = useMutation(trpc.checklist.item.toggle.mutationOptions(onMutated));
  const editItem = useMutation(trpc.checklist.item.update.mutationOptions(onMutated));
  const deleteItem = useMutation(trpc.checklist.item.delete.mutationOptions(onMutated));
  // JSON ile toplu içe aktarma — `createChecklist` gibi invalidate-only
  // (optimistic ŞART DEĞİL: tek transaction'da N liste + madde eklenir, sonuç
  // `invalidateCard` ile geri çekilir). `clientMutationId` collaborative
  // sözleşmesi gereği gönderilir; kendi realtime echo'su onunla filtrelenir.
  const bulkImport = useMutation(trpc.checklist.bulkImport.mutationOptions(onMutated));
  // Madde sıralama (DEM — web checklist item reorder). Diğer checklist
  // mutation'larından farklı olarak OPTIMISTIC: `checklist.list` cache'inde
  // ilgili checklist'in `items` dizisini drop'taki `orderedIds`'e göre anında
  // yeniden dizer (snapshot + rollback), `onSettled`'da invalidate gerçek
  // LexoRank pozisyonlarını geri çeker. Drag SIRASINDA değil, yalnız drop'ta
  // bir kez tetiklenir (`onReorderItem`). `clientMutationId` collaborative
  // sözleşmesi gereği gönderilir.
  const checklistListFilter = useMemo(
    () => trpc.checklist.list.queryFilter({ cardId }),
    [trpc, cardId],
  );
  // Optimistic patch verisi `onMutate` içinde gerekli; mutation input'u taşımaz
  // (yalnız komşu id'leri gider). İç içe maddelerde sıralama global değil kardeş
  // grubu içindir — bu yüzden optimistic reorder taşınan maddenin `position`'ını
  // `newPosition` yapar; render katmanı düz listeyi `buildChecklistTree` ile
  // position'a göre yeniden dizer (grup-bazlı applyOrder diğer grupları düşürürdü).
  const reorderPatchRef = useRef<{ itemId: string; newPosition: string } | null>(null);
  const reorderItem = useMutation(
    trpc.checklist.item.reorder.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(checklistListFilter);
        // Cache tipi `checklist.list` çıktısından çıkarsanır (ChecklistView'dan
        // daha zengin: createdAt/updatedAt/completedAt vb.).
        type ChecklistListData = NonNullable<typeof checklistsQ.data>;
        const queryKey = trpc.checklist.list.queryKey({ cardId });
        const prev = queryClient.getQueryData<ChecklistListData>(queryKey);
        // `newPosition` mutation input'unda yok (yalnız komşu id'leri gider); drop
        // callback'i `mutate` öncesi ref'e yazar, burada okunur.
        const reorderPatch = reorderPatchRef.current;
        if (prev && reorderPatch) {
          queryClient.setQueryData<ChecklistListData>(queryKey, (lists) =>
            (lists ?? []).map((list) =>
              list.id === vars.checklistId
                ? {
                    ...list,
                    items: list.items.map((it) =>
                      it.id === reorderPatch.itemId
                        ? { ...it, position: reorderPatch.newPosition }
                        : it,
                    ),
                  }
                : list,
            ),
          );
        }
        return { prev, queryKey };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(ctx.queryKey, ctx.prev);
        toast.error(strings.board.optimistic.error);
      },
      onSettled: () => queryClient.invalidateQueries(checklistListFilter),
    }),
  );
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
          if (canEdit) setAddMenu('due');
        },
      },
      {
        id: 'card-members',
        match: (event) => event.key === 'm' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setAddMenu('members');
        },
      },
      {
        id: 'card-labels',
        match: (event) => event.key === 't' && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEdit) setAddMenu('labels');
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
      // DEM-174 — ham `err.message` teknik/İngilizce sızdırabilir.
      setCoverImageUploadError(
        err instanceof TRPCClientError
          ? friendlyErrorMessage(err)
          : detailCopy.modal.coverImageUploadFailed,
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

  // --- Deep-link focus (scroll + flash) -----------------------------------
  // Notification deep-links may target an in-card item. The matching DOM node
  // carries a `data-*` id (comment / checklist item / attachment); `useTargetFlash`
  // hunts for it once the relevant data is loaded and the target's container is
  // mounted, then scrolls it to centre + flashes once. The hooks no-op when the
  // target id is absent. The checklist target lives in the always-rendered left
  // column; the comment/attachment targets only mount when the sidebar's matching
  // tab is active — `deepLinkWantsSidebar` + the requested tab handle that above.
  useTargetFlash(highlightChecklistItemId, 'checklist-item-id', !checklistsQ.isPending);
  useTargetFlash(highlightCommentId, 'comment-id', sidebarOpen && !commentsQ.isPending);
  // Ekler artık sol kolon galerisinde; galeri açıkken tile mount olur, bounded
  // RAF hunt onu bulup scroll + flash uygular.
  useTargetFlash(highlightAttachmentId, 'attachment-id', attachmentsOpen);

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none',
          fullscreen
            ? 'h-screen max-h-screen w-screen rounded-none'
            : 'h-[85vh] max-h-[85vh] w-[min(1040px,92vw)] lg:w-[62vw]',
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
              boardId={boardId}
              canShare={canEdit}
              boardName={boardTitle}
              listName={listTitle}
              coverImage={card.coverImage ?? null}
              coverImageUrl={card.coverImageUrl ?? null}
              coverColor={coverColor}
              archived={archived}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((value) => !value)}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((value) => !value)}
              metaInfo={
                <CardModalMetaInfo
                  memberCount={cardMembers.length}
                  labelCount={(cardLabelsQ.data ?? []).length}
                  dueAt={card.dueAt}
                  coverColor={coverColor}
                  attachmentCount={attachmentCount}
                  onColored={coverColor != null && !card.coverImage}
                />
              }
              addAction={
                <CardModalAddPopover
                  canEdit={canEdit}
                  onColored={coverColor != null && !card.coverImage}
                  view={addMenu}
                  onViewChange={setAddMenu}
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
                        addLabel.isPending ||
                        removeLabel.isPending ||
                        createLabel.isPending
                      }
                      error={errOf(addLabel) || errOf(removeLabel) || errOf(createLabel)}
                    />
                  }
                  coverContent={
                    <CardDetailCoverColor
                      coverColor={coverColor}
                      coverImage={card.coverImage ?? null}
                      canEdit={canEdit}
                      onSelect={(next) =>
                        updateCoverColor.mutate({ cardId, coverColor: next })
                      }
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
                  attachmentContent={
                    <CardAttachmentAddForm
                      cardId={cardId}
                      canEdit={canEdit}
                      onSuccess={() => setAddMenu(null)}
                    />
                  }
                />
              }
            />

            <div
              className={cn(
                'grid min-h-0 flex-1 grid-cols-1 overflow-hidden',
                // Sağ panel açılış/kapanışında grid track'i yumuşat (§20.4) —
                // en az layout-shift veren yol: grid-template-columns geçişi.
                'md:transition-[grid-template-columns] md:duration-(--duration-slow) md:ease-standard md:motion-reduce:transition-none',
                sidebarOpen && 'md:grid-cols-[1fr_360px]',
              )}
            >
              {/* Left column ------------------------------------------------ */}
              {/* Toplam scroll YOK — başlık/alert sabit (flex-shrink-0),
                  alttaki iki sütun grid kalan alanı doldurur ve her sütun
                  kendi içinde bağımsız scroll yapar (2026-05-25). Meta
                  chip'ler artık modal header'da (sidebar toggle vb.
                  butonların solunda) — başlık tüm satırı kullanır. */}
              <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                <div className="min-w-0 shrink-0 bg-background px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
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
                  </div>
                </div>

                {(completeError || archiveCard.isError) && (
                  <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 sm:px-6">
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
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-hidden px-4 pb-4 sm:px-6 sm:pb-5">
                  {/* Üst satır: AÇIKLAMA | KONTROL LİSTESİ — bir checklist maddesi
                      detayı açılınca 3 eşit sütuna bölünür (açıklama | liste |
                      detay): açıklama 1/3, kontrol listesi 2/3 (içinde liste +
                      detay eşit ⇒ her biri 1/3). EKLER açıkken dikeyde 50/50 böl. */}
                  <div
                    className={cn(
                      'grid min-h-0 gap-[22px] overflow-hidden',
                      'md:transition-[grid-template-columns] md:duration-(--duration-slow) md:ease-standard md:motion-reduce:transition-none',
                      checklistFocused
                        ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
                        : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
                      attachmentsOpen ? 'flex-1 basis-0' : 'flex-1',
                    )}
                  >
                    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/30">
                      <CardDetailDescription
                      description={card.description}
                      cardTitle={card.title}
                      canEdit={canEdit}
                      onSave={(description) => updateDescription.mutate({ cardId, description })}
                      pending={updateDescription.isPending}
                      error={errOf(updateDescription)}
                    />
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/30">
                    <CardDetailChecklists
                      checklists={(checklistsQ.data ?? []) as ChecklistView[]}
                      canEdit={canEdit}
                      onFocusedChange={setChecklistFocused}
                      nameOf={nameOf}
                      imageOf={imageOf}
                      comments={{
                        cardId,
                        canComment: canEdit,
                        isBoardAdmin,
                        viewerUserId,
                        viewerName,
                        viewerImage,
                        mentions: mentionSource,
                      }}
                      attachments={{
                        cardId,
                        canEdit,
                        isBoardAdmin,
                        viewerUserId,
                      }}
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
                      onArchiveChecklist={({ checklistId, archived }) =>
                        archiveChecklist.mutate({
                          cardId,
                          checklistId,
                          archived,
                          clientMutationId: cmid(),
                        })
                      }
                      onAddItem={({ checklistId, content, parentItemId }) =>
                        addItem.mutate({
                          cardId,
                          checklistId,
                          content,
                          parentItemId: parentItemId ?? undefined,
                          clientMutationId: cmid(),
                        })
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
                        deleteItem.mutate({
                          cardId,
                          checklistId,
                          itemId,
                          clientMutationId: cmid(),
                        })
                      }
                      onReorderItem={({
                        checklistId,
                        itemId,
                        beforeItemId,
                        afterItemId,
                        newPosition,
                      }) => {
                        // Taşınan maddenin `newPosition`'ını optimistic patch için
                        // ref'e koy, sonra mutation'ı gerçek komşularla at (drop'ta
                        // bir kez). Render `buildChecklistTree` ile yeniden dizer.
                        reorderPatchRef.current = { itemId, newPosition };
                        reorderItem.mutate({
                          cardId,
                          checklistId,
                          itemId,
                          beforeItemId: beforeItemId ?? undefined,
                          afterItemId: afterItemId ?? undefined,
                          clientMutationId: cmid(),
                        });
                      }}
                      onBulkImport={(checklists) =>
                        bulkImport.mutate({ cardId, checklists, clientMutationId: cmid() })
                      }
                      pending={
                        createChecklist.isPending ||
                        renameChecklist.isPending ||
                        deleteChecklist.isPending ||
                        archiveChecklist.isPending ||
                        addItem.isPending ||
                        toggleItem.isPending ||
                        editItem.isPending ||
                        deleteItem.isPending ||
                        bulkImport.isPending
                      }
                      error={
                        errOf(createChecklist) ||
                        errOf(renameChecklist) ||
                        errOf(deleteChecklist) ||
                        errOf(archiveChecklist) ||
                        errOf(addItem) ||
                        errOf(toggleItem) ||
                        errOf(editItem) ||
                        errOf(deleteItem) ||
                        errOf(bulkImport)
                      }
                      // Dialog'un yalnız kendi durumunu göstermesi için izole
                      // pending/error (modal açıkken üstteki genel Alert görünmez).
                      bulkImportPending={bulkImport.isPending}
                      bulkImportError={errOf(bulkImport)}
                    />
                    </div>
                  </div>

                  {/* Alt satır: EKLER galerisi — collapsible, varsayılan kapalı.
                      Kapalıyken yalnız header bar görünür (shrink-0); açıkken üst
                      satırla dikeyde 50/50 (flex-1 basis-0) ve kendi içinde scroll —
                      modal geneli scroll çıkmaz (§13.10.9). */}
                  <div
                    className={cn(
                      'flex min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/30',
                      attachmentsOpen ? 'min-h-0 flex-1 basis-0' : 'shrink-0',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setAttachmentsOpen((value) => !value)}
                      aria-expanded={attachmentsOpen}
                      aria-controls="card-attachments-panel"
                      className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/70"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <PaperclipIcon className="size-3.5 shrink-0" aria-hidden />
                        <span className="text-[11px] font-semibold tracking-wide uppercase">
                          {strings.attachment.section.title}
                        </span>
                        {attachmentCount > 0 && (
                          <span className="text-[11px] font-semibold text-muted-foreground/80">
                            {attachmentCount}
                          </span>
                        )}
                      </span>
                      {attachmentsOpen ? (
                        <ChevronUpIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : (
                        <ChevronDownIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </button>
                    {attachmentsOpen && (
                      <div
                        id="card-attachments-panel"
                        className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto p-4"
                      >
                        <CardDetailAttachments
                          cardId={cardId}
                          canEdit={canEdit}
                          isBoardAdmin={isBoardAdmin}
                          viewerUserId={viewerUserId}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right panel ------------------------------------------------ */}
              {sidebarOpen && (
                <CardModalSidebar
                  comments={commentsQ.data ?? []}
                  activity={activityQ.data ?? []}
                  activityPending={activityQ.isPending}
                  activityError={
                    activityQ.isError
                      ? activityQ.error?.message || strings.common.unknownError
                      : null
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
                  tab={sidebarTab}
                  onTabChange={setSidebarTab}
                />
              )}
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
