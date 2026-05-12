'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  CardCompleteToggle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LabelChip,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import {
  CARD_COVER_COLORS,
  LABEL_COLORS,
  type CardCoverColor,
  type LabelColor,
} from '@pusula/domain';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { LABEL_PALETTE } from './label-colors';
import { CardMetaRow, type CardMember } from './card-meta-row';

export type BoardCardLabel = { labelId: string; name: string; color: string };

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
  /** Whether the card is marked complete (`board.get` → `cards[].completed`). */
  completed: boolean;
  /** Cover colour name, or `null` (`board.get` → `cards[].coverColor`). */
  coverColor: string | null;
  /** Labels attached to this card (`board.get` → `cards[].labels`). May be empty. */
  labels: BoardCardLabel[];
  /** Total checklist items across the card's checklists (`board.get`). */
  checklistTotal: number;
  /** Completed checklist items (`board.get`). */
  checklistDone: number;
  /** Non-deleted comment count (`board.get`). */
  commentCount: number;
  /** Card members — name + image + role only, never e-mail (`board.get`). May be empty. */
  members: CardMember[];
};

type CardItemProps = {
  boardId: string;
  card: BoardCard;
  /** Whether the viewer may edit/archive this card (board `member+`, list & board active). */
  canEdit: boolean;
};

/** Whether `color` is one of the domain's known label colours. */
function isLabelColor(color: string): color is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(color);
}

/** Whether `value` is one of the 12 cover-colour palette names. */
function asCoverColor(value: string | null): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}

/**
 * Cover-colour stripe background per palette name. Literal `bg-palet-*` strings —
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

/**
 * A single card chip in a list column. Clicking (or pressing Enter/Space)
 * navigates to `?card=<id>` (shallow), which opens the card detail modal (the
 * board page renders `CardDetailRoute`); title / description / due editing lives
 * there. The chip surfaces an optional cover-colour stripe, a label-chip row,
 * the title (struck through when complete), and a compact metadata strip
 * (`CardMetaRow` — due / description / checklist / comments / members). A "card
 * done" toggle sits to the left of the title (always visible once complete,
 * hover-to-reveal otherwise); when `canEdit`, a quick "archive" action (hover
 * icon → confirm dialog) is in the top-right. The complete toggle and the
 * archive dialog `stopPropagation` so they don't also open the card. All
 * mutations invalidate `board.get`. Drag-and-drop is Phase 3 (DEM-26).
 */
export function CardItem({ boardId, card, canEdit }: CardItemProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const copy = strings.board.card;

  const [archiveOpen, setArchiveOpen] = useState(false);

  const openCard = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('card', card.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Only react to the article itself, not bubbled events from inner controls.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openCard();
    }
  };

  const invalidateBoard = () => queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));

  const archiveCard = useMutation(
    trpc.card.archive.mutationOptions({
      onSuccess: async () => {
        await invalidateBoard();
        setArchiveOpen(false);
      },
    }),
  );
  const completeCard = useMutation(trpc.card.complete.mutationOptions({ onSuccess: invalidateBoard }));
  const uncompleteCard = useMutation(
    trpc.card.uncomplete.mutationOptions({ onSuccess: invalidateBoard }),
  );
  const completePending = completeCard.isPending || uncompleteCard.isPending;

  const handleArchiveOpenChange = (next: boolean) => {
    if (archiveCard.isPending) return;
    setArchiveOpen(next);
    if (!next) archiveCard.reset();
  };

  const coverColor = asCoverColor(card.coverColor);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={card.title}
      onClick={openCard}
      onKeyDown={handleKeyDown}
      className={cn(
        'bg-card group/kart relative cursor-pointer rounded-md border p-2 text-sm shadow-card outline-none',
        'transition-[box-shadow,border-color] hover:border-foreground/30 hover:shadow-card-hover',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      {coverColor && (
        <div className={cn('-mx-2 -mt-2 mb-1.5 h-3 rounded-t-md', COVER_BAR[coverColor])} aria-hidden />
      )}

      {card.labels.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <li key={label.labelId}>
              {isLabelColor(label.color) ? (
                <LabelChip
                  color={LABEL_PALETTE[label.color]}
                  name={label.name.trim() || undefined}
                  variant="solid"
                />
              ) : (
                <span className="bg-muted text-muted-foreground inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                  {label.name.trim() || copy.unnamedLabel}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-1.5">
        <CardCompleteToggle
          checked={card.completed}
          alwaysVisible={card.completed}
          disabled={!canEdit || completePending}
          aria-label={card.completed ? copy.completeUntoggle : copy.completeToggle}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(next) =>
            next
              ? completeCard.mutate({ cardId: card.id, clientMutationId: crypto.randomUUID() })
              : uncompleteCard.mutate({ cardId: card.id, clientMutationId: crypto.randomUUID() })
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

      <CardMetaRow
        description={card.description}
        dueAt={card.dueAt}
        checklistTotal={card.checklistTotal}
        checklistDone={card.checklistDone}
        commentCount={card.commentCount}
        members={card.members}
      />

      {canEdit && (
        <Dialog open={archiveOpen} onOpenChange={handleArchiveOpenChange}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.archive}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover/kart:opacity-100 focus-visible:opacity-100"
                >
                  <ArchiveIcon className="size-3.5" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>{copy.archive}</TooltipContent>
          </Tooltip>
          <DialogContent
            closeLabel={strings.common.close}
            onClick={(event) => event.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>{copy.archiveConfirmTitle}</DialogTitle>
              <DialogDescription>{copy.archiveConfirmDescription}</DialogDescription>
            </DialogHeader>
            {archiveCard.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {archiveCard.error.message || strings.common.unknownError}
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
                onClick={() =>
                  archiveCard.mutate({
                    cardId: card.id,
                    archived: true,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
              >
                {archiveCard.isPending ? copy.archiving : copy.archiveConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}
