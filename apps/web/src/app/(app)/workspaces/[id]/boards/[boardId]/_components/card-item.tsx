'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveIcon,
  CalendarIcon,
  CircleOffIcon,
  ImageIcon,
  MoveIcon,
  TagIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  CardCompleteToggle,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  cn,
  toast,
} from '@pusula/ui';
import {
  CARD_COVER_COLORS,
  CARD_COVER_IMAGE_MIME_TYPES,
  LABEL_COLORS,
  type CardCoverColor,
  type LabelColor,
} from '@pusula/domain';
import {
  applyCardArchive,
  applyCardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { formatDate, toDateInputValue } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { useBoardDndContext } from './board-dnd-context';
import { CardCoverImage, type CoverImage } from './card-cover-image';
import { CardMetaRow, type CardMember } from './card-meta-row';
import { LABEL_SWATCH } from './label-colors';
import type { BoardList } from './list-column';

export type BoardCardLabel = { labelId: string; name: string; color: string };
export type BoardCardLabelOption = { id: string; name: string; color: string };
export type BoardCardMemberOption = { userId: string; name: string | null };

export type BoardCard = {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string | null;
  position: string;
  dueAt: Date | string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Whether the card is marked complete (`board.get` -> `cards[].completed`). */
  completed: boolean;
  /** Cover colour name, or `null` (`board.get` -> `cards[].coverColor`). */
  coverColor: string | null;
  coverImageAttachmentId?: string | null;
  coverImage?: CoverImage | null;
  /** Labels attached to this card (`board.get` -> `cards[].labels`). May be empty. */
  labels: BoardCardLabel[];
  /** Total checklist items across the card's checklists (`board.get`). */
  checklistTotal: number;
  /** Completed checklist items (`board.get`). */
  checklistDone: number;
  /** Non-deleted comment count (`board.get`). */
  commentCount: number;
  /** Committed-only attachment count — drafts excluded (`board.get`, Faz 11B). */
  attachmentCount?: number;
  /** Card members - name + image + role only, never e-mail (`board.get`). May be empty. */
  members: CardMember[];
};

type CardItemProps = {
  boardId: string;
  card: BoardCard;
  /** Whether the viewer may edit/archive this card (board `member+`, list & board active). */
  canEdit: boolean;
  /**
   * The board's lists (active + archived), `position`-sorted - used by the
   * context menu "move to list" picker. Optional so a `CardItem` rendered in
   * isolation works.
   */
  allLists?: BoardList[];
  /** Board label palette used by the card context menu. */
  boardLabels?: BoardCardLabelOption[];
  /** Board members used by the card context menu. */
  boardMembers?: BoardCardMemberOption[];
};

/** Whether `value` is one of the 12 cover-colour palette names. */
function asCoverColor(value: string | null): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}

function asCoverImageMimeType(value: string) {
  return (CARD_COVER_IMAGE_MIME_TYPES as readonly string[]).includes(value)
    ? (value as (typeof CARD_COVER_IMAGE_MIME_TYPES)[number])
    : null;
}

/**
 * Cover-colour stripe background per palette name. Literal `bg-palet-*` strings -
 * spelled out so Tailwind's content scanner picks all 12 up.
 */
const COVER_BAR: Record<CardCoverColor, string> = {
  kirmizi: 'bg-palet-kirmizi',
  turuncu: 'bg-palet-turuncu',
  sari: 'bg-palet-sari',
  lime: 'bg-palet-lime',
  yesil: 'bg-palet-yesil',
  sky: 'bg-palet-sky',
  mavi: 'bg-palet-mavi',
  indigo: 'bg-palet-indigo',
  mor: 'bg-palet-mor',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
  siyah: 'bg-palet-siyah',
};

function displayLabelName(label: { name: string }) {
  return label.name.trim() || strings.board.card.unnamedLabel;
}

function asLabelColor(value: string): LabelColor | null {
  return (LABEL_COLORS as readonly string[]).includes(value) ? (value as LabelColor) : null;
}

function displayMemberName(member: BoardCardMemberOption) {
  return member.name?.trim() || member.userId;
}

function CardChecklistProgress({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const complete = done >= total;

  return (
    <div data-slot="card-checklist-progress" className="mt-1.5 space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-medium">{strings.card.checklist.title}</span>
        <span className={cn('shrink-0 tabular-nums', complete && 'text-success')}>
          {done}/{total}
        </span>
      </div>
      <Progress value={done} max={total} complete={complete} className="h-1" />
    </div>
  );
}

function startOfLocalDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function thisWeekend(today: Date) {
  const day = today.getDay();
  return addDays(today, day === 0 ? 0 : 6 - day);
}

function nextWeek(today: Date) {
  const day = today.getDay();
  return addDays(today, day === 0 ? 1 : 8 - day);
}

function dueQuickOptions(now = new Date()) {
  const today = startOfLocalDay(now);
  return [
    { key: 'today', label: strings.board.card.contextDueToday, dueAt: today },
    { key: 'tomorrow', label: strings.board.card.contextDueTomorrow, dueAt: addDays(today, 1) },
    { key: 'weekend', label: strings.board.card.contextDueWeekend, dueAt: thisWeekend(today) },
    { key: 'next-week', label: strings.board.card.contextDueNextWeek, dueAt: nextWeek(today) },
  ] as const;
}

/**
 * A single card chip in a list column. Clicking (or pressing Enter/Space)
 * navigates to `?card=<id>` (shallow), which opens the card detail modal (the
 * board page renders `CardDetailRoute`). Right-click opens a Trello-style
 * context menu for cover colour, labels, members, due date, move and archive.
 */
export function CardItem({
  boardId,
  card,
  canEdit,
  allLists = [],
  boardLabels = [],
  boardMembers = [],
}: CardItemProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const copy = strings.board.card;
  const dndCopy = strings.board.dnd;
  const menuCopy = copy.context;
  const dnd = useBoardDndContext();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCoverImageRef = useRef<CoverImage | null>(null);

  const articleRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef(card);
  cardRef.current = card;

  const handleDraggingChange = useCallback(
    (next: boolean, options?: { settleUntilCacheUpdate?: boolean }) => {
      if (next) {
        setDragging(true);
        return;
      }
      if (options?.settleUntilCacheUpdate) return;
      setDragging(false);
    },
    [],
  );

  useEffect(() => {
    if (!dnd || !canEdit) return;
    const el = articleRef.current;
    if (!el) return;
    return dnd.registerCard({
      element: el,
      cardId: card.id,
      listId: card.listId,
      position: card.position,
      isDropTarget: canEdit,
      onDraggingChange: handleDraggingChange,
      getCard: () => cardRef.current,
    });
  }, [dnd, card.id, card.listId, card.position, canEdit, handleDraggingChange]);

  useLayoutEffect(() => {
    if (dragging) setDragging(false);
  }, [card.position, card.listId]);

  const openCard = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('card', card.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openCard();
    }
  };

  const onConflict = () => toast(strings.board.conflict.refreshed);
  const onMutationError = () => toast.error(strings.board.optimistic.error);

  const archiveCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.archive.mutationOptions,
    boardId,
    cardId: card.id,
    apply: (data, vars) => (vars.archived ? applyCardArchive(data, vars.cardId) : data),
    onConflict,
    onMutationError,
    onMutationSuccess: () => setArchiveOpen(false),
  });
  const completeCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.complete.mutationOptions,
    boardId,
    cardId: card.id,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: true }),
    onConflict,
    onMutationError,
  });
  const uncompleteCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.uncomplete.mutationOptions,
    boardId,
    cardId: card.id,
    apply: (data, vars) => applyCardPatch(data, vars.cardId, { completed: false }),
    onConflict,
    onMutationError,
  });
  const updateCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.update.mutationOptions,
    boardId,
    cardId: card.id,
    apply: (data, vars) => {
      const patch: {
        coverColor?: string | null;
        dueAt?: Date | null;
        coverImageAttachmentId?: string | null;
        coverImage?: CoverImage | null;
      } = {};
      if ('coverColor' in vars) patch.coverColor = vars.coverColor ?? null;
      if ('dueAt' in vars) patch.dueAt = (vars.dueAt as Date | null | undefined) ?? null;
      if ('coverImageAttachmentId' in vars) {
        patch.coverImageAttachmentId = vars.coverImageAttachmentId ?? null;
        patch.coverImage = pendingCoverImageRef.current;
      }
      return applyCardPatch(data, vars.cardId, patch as Partial<(typeof data.cards)[number]>);
    },
    onConflict,
    onMutationError,
  });
  // Faz 11B (DEM-148) — cover image now uses two-phase commit (`initiate` +
  // `commit`). The cover-image link points to the committed row's `id`.
  const initiateAttachment = useMutation(trpc.attachment.initiate.mutationOptions());
  const commitAttachment = useMutation(trpc.attachment.commit.mutationOptions());

  const invalidateBoardCardData = async () => {
    await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
    await queryClient.invalidateQueries(trpc.card.get.queryFilter({ cardId: card.id }));
    await queryClient.invalidateQueries(trpc.card.members.list.queryFilter({ cardId: card.id }));
    await queryClient.invalidateQueries(trpc.card.labels.list.queryFilter({ cardId: card.id }));
  };

  const mutationInvalidation = { onSuccess: invalidateBoardCardData };
  const addLabel = useMutation(trpc.card.labels.add.mutationOptions(mutationInvalidation));
  const removeLabel = useMutation(trpc.card.labels.remove.mutationOptions(mutationInvalidation));
  const addMember = useMutation(trpc.card.members.add.mutationOptions(mutationInvalidation));
  const removeMember = useMutation(trpc.card.members.remove.mutationOptions(mutationInvalidation));

  const completePending = completeCard.isPending || uncompleteCard.isPending;

  const handleArchiveOpenChange = (next: boolean) => {
    if (archiveCard.isPending) return;
    setArchiveOpen(next);
    if (!next) archiveCard.reset();
  };

  const moveTargets = dnd
    ? [...allLists]
        .filter((list) => list.archivedAt == null)
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    : [];

  const coverColor = asCoverColor(card.coverColor);
  const selectedLabelIds = new Set(card.labels.map((label) => label.labelId));
  const memberRolesByUser = new Map<string, BoardCard['members']>();
  for (const member of card.members) {
    const bucket = memberRolesByUser.get(member.userId);
    if (bucket) bucket.push(member);
    else memberRolesByUser.set(member.userId, [member]);
  }
  const selectedDueKey = toDateInputValue(card.dueAt);
  const dueOptions = dueQuickOptions();
  const imageControlsDisabled =
    initiateAttachment.isPending || commitAttachment.isPending || updateCard.isPending;

  const toggleLabel = (labelId: string) => {
    const vars = { cardId: card.id, labelId, clientMutationId: crypto.randomUUID() };
    if (selectedLabelIds.has(labelId)) removeLabel.mutate(vars);
    else addLabel.mutate(vars);
  };

  const toggleMember = (member: BoardCardMemberOption) => {
    const assignments = memberRolesByUser.get(member.userId) ?? [];
    if (assignments.length === 0) {
      addMember.mutate({
        cardId: card.id,
        userId: member.userId,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      });
      return;
    }
    for (const assignment of assignments) {
      removeMember.mutate({
        cardId: card.id,
        userId: member.userId,
        role: assignment.role,
        clientMutationId: crypto.randomUUID(),
      });
    }
  };

  const uploadCoverImage = async (file: File) => {
    const mimeType = asCoverImageMimeType(file.type);
    if (!mimeType) {
      toast.error(menuCopy.coverImageUploadFailed);
      return;
    }

    try {
      const initiated = await initiateAttachment.mutateAsync({
        cardId: card.id,
        fileName: file.name,
        mimeType,
        size: file.size,
        clientMutationId: crypto.randomUUID(),
      });
      const response = await fetch(initiated.upload.url, {
        method: 'PUT',
        headers: initiated.upload.headers,
        body: file,
      });
      if (!response.ok) throw new Error(menuCopy.coverImageUploadFailed);

      const committed = await commitAttachment.mutateAsync({
        attachmentId: initiated.attachmentId,
        clientMutationId: crypto.randomUUID(),
      });
      pendingCoverImageRef.current = {
        attachmentId: committed.id,
        fileName: committed.fileName,
        mimeType: committed.mimeType,
        size: committed.size,
      };
      await updateCard.mutateAsync({
        cardId: card.id,
        coverImageAttachmentId: committed.id,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : menuCopy.coverImageUploadFailed);
    } finally {
      pendingCoverImageRef.current = null;
      if (coverImageInputRef.current) coverImageInputRef.current.value = '';
    }
  };

  const clearCoverImage = () => {
    pendingCoverImageRef.current = null;
    updateCard.mutate({ cardId: card.id, coverImageAttachmentId: null });
  };

  const article = (
    <article
      ref={articleRef}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      data-board-card-id={card.id}
      onClick={openCard}
      onKeyDown={handleKeyDown}
      data-dragging={dragging ? '' : undefined}
      className={cn(
        'relative cursor-pointer rounded-md p-2 text-sm outline-none',
        'transition-shadow',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        !dragging &&
          'group group/kart bg-[color:var(--board-card-bg)] shadow-sm hover:shadow-card-hover',
        !dragging &&
          card.archivedAt != null &&
          'border border-dashed border-muted-foreground/40 opacity-70 shadow-none',
        dragging && 'border border-dashed border-primary/60 bg-primary/5',
      )}
    >
      <div className={cn('flex flex-col gap-1', dragging && 'invisible')}>
        {card.coverImage ? (
          <CardCoverImage
            coverImage={card.coverImage}
            alt={`${card.title} kapak`}
            className="-mx-2 -mt-2 mb-1.5 h-24 rounded-t-md"
          />
        ) : coverColor ? (
          <div
            className={cn('-mx-2 -mt-2 mb-1.5 h-1 rounded-t-md', COVER_BAR[coverColor])}
            aria-hidden
          />
        ) : null}

        <div className="flex items-start gap-1.5">
          <CardCompleteToggle
            checked={card.completed}
            alwaysVisible={card.completed}
            disabled={!canEdit || completePending}
            aria-label={card.completed ? copy.completeUntoggle : copy.completeToggle}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(next) =>
              next
                ? completeCard.mutate({ cardId: card.id })
                : uncompleteCard.mutate({ cardId: card.id })
            }
            className="mt-0.5"
          />
          <div
            className={cn(
              'min-w-0 flex-1 font-medium leading-snug break-words line-clamp-3',
              card.completed && 'text-muted-foreground line-through',
            )}
          >
            {card.title}
          </div>
        </div>

        <CardChecklistProgress done={card.checklistDone} total={card.checklistTotal} />
        <CardMetaRow
          description={card.description}
          dueAt={card.dueAt}
          labelCount={card.labels.length}
          commentCount={card.commentCount}
          attachmentCount={card.attachmentCount}
          members={card.members}
        />
      </div>
    </article>
  );

  const archiveDialog = (
    <Dialog open={archiveOpen} onOpenChange={handleArchiveOpenChange}>
      <DialogContent closeLabel={strings.common.close} onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{copy.archiveConfirmTitle}</DialogTitle>
          <DialogDescription>{copy.archiveConfirmDescription}</DialogDescription>
        </DialogHeader>
        {archiveCard.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {getMutationErrorMessage(archiveCard) ?? strings.common.unknownError}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={archiveCard.isPending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={archiveCard.isPending}
            onClick={() => archiveCard.mutate({ cardId: card.id, archived: true })}
          >
            {archiveCard.isPending ? copy.archiving : copy.archiveConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!canEdit) return article;

  return (
    <>
      <input
        ref={coverImageInputRef}
        type="file"
        aria-label={menuCopy.coverImageUpload}
        accept={CARD_COVER_IMAGE_MIME_TYPES.join(',')}
        disabled={imageControlsDisabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadCoverImage(file);
        }}
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>{article}</ContextMenuTrigger>
        <ContextMenuContent
          className="w-56"
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ImageIcon className="size-4" aria-hidden />
              {menuCopy.coverColor}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              <ContextMenuLabel className="text-muted-foreground text-xs font-normal">
                {menuCopy.coverColorSection}
              </ContextMenuLabel>
              <div className="grid grid-cols-4 gap-1.5 p-1 pt-0">
                {CARD_COVER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`${menuCopy.coverColorOf} ${color}`}
                    aria-pressed={coverColor === color}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (coverColor !== color)
                        updateCard.mutate({ cardId: card.id, coverColor: color });
                    }}
                    className={cn(
                      'size-8 rounded-md outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-ring/60',
                      COVER_BAR[color],
                      coverColor === color && 'ring-2 ring-foreground',
                    )}
                  />
                ))}
              </div>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={coverColor == null}
                onSelect={() => updateCard.mutate({ cardId: card.id, coverColor: null })}
              >
                <CircleOffIcon className="size-4" aria-hidden />
                {menuCopy.coverColorClear}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel className="text-muted-foreground text-xs font-normal">
                {menuCopy.coverImageSection}
              </ContextMenuLabel>
              <ContextMenuItem
                disabled={imageControlsDisabled}
                onSelect={(event) => {
                  event.preventDefault();
                  coverImageInputRef.current?.click();
                }}
              >
                <UploadIcon className="size-4" aria-hidden />
                {menuCopy.coverImageUpload}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!card.coverImage || imageControlsDisabled}
                onSelect={clearCoverImage}
              >
                <XIcon className="size-4" aria-hidden />
                {menuCopy.coverImageClear}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <TagIcon className="size-4" aria-hidden />
              {menuCopy.labels}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {boardLabels.length === 0 ? (
                <ContextMenuItem disabled>{menuCopy.noLabels}</ContextMenuItem>
              ) : (
                boardLabels.map((label) => {
                  const labelColor = asLabelColor(label.color);
                  return (
                    <ContextMenuCheckboxItem
                      key={label.id}
                      checked={selectedLabelIds.has(label.id)}
                      onSelect={(event) => {
                        event.preventDefault();
                        toggleLabel(label.id);
                      }}
                    >
                      <span
                        className={cn(
                          'size-3 shrink-0 rounded-full',
                          labelColor ? LABEL_SWATCH[labelColor] : 'bg-muted',
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{displayLabelName(label)}</span>
                    </ContextMenuCheckboxItem>
                  );
                })
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <UsersIcon className="size-4" aria-hidden />
              {menuCopy.members}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {boardMembers.length === 0 ? (
                <ContextMenuItem disabled>{menuCopy.noMembers}</ContextMenuItem>
              ) : (
                boardMembers.map((member) => (
                  <ContextMenuCheckboxItem
                    key={member.userId}
                    checked={memberRolesByUser.has(member.userId)}
                    onSelect={(event) => {
                      event.preventDefault();
                      toggleMember(member);
                    }}
                  >
                    <span className="truncate">{displayMemberName(member)}</span>
                  </ContextMenuCheckboxItem>
                ))
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <CalendarIcon className="size-4" aria-hidden />
              {menuCopy.dueDate}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              <ContextMenuLabel className="text-muted-foreground text-xs font-normal">
                {card.dueAt
                  ? `${menuCopy.dueCurrent}: ${formatDate(card.dueAt)}`
                  : menuCopy.dueEmpty}
              </ContextMenuLabel>
              <ContextMenuSeparator />
              {dueOptions.map((option) => {
                const optionKey = toDateInputValue(option.dueAt);
                return (
                  <ContextMenuCheckboxItem
                    key={option.key}
                    checked={selectedDueKey === optionKey}
                    onSelect={(event) => {
                      event.preventDefault();
                      updateCard.mutate({ cardId: card.id, dueAt: option.dueAt });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDate(option.dueAt)}
                    </span>
                  </ContextMenuCheckboxItem>
                );
              })}
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={card.dueAt == null}
                onSelect={() => updateCard.mutate({ cardId: card.id, dueAt: null })}
              >
                <CircleOffIcon className="size-4" aria-hidden />
                {menuCopy.dueClear}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={moveTargets.length === 0}>
              <MoveIcon className="size-4" aria-hidden />
              {dndCopy.move}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {moveTargets.map((list) => (
                <ContextMenuItem
                  key={list.id}
                  disabled={list.id === card.listId}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (list.id !== card.listId)
                      dnd?.moveCardToListEnd(card.id, card.listId, list.id);
                  }}
                >
                  <span className="truncate">
                    {list.title}
                    {list.id === card.listId ? '' : ` - ${dndCopy.moveToListEnd}`}
                  </span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setArchiveOpen(true)}>
            <ArchiveIcon className="size-4" aria-hidden />
            {copy.archive}
          </ContextMenuItem>
        </ContextMenuContent>
        {archiveDialog}
      </ContextMenu>
    </>
  );
}
