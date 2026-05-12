'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
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
import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
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

/**
 * A single card chip in a list column. Clicking (or pressing Enter/Space)
 * navigates to `?card=<id>` (shallow), which opens the card detail modal (the
 * board page renders `CardDetailRoute`); title / description / due editing lives
 * there. The chip surfaces a label-chip row, the title, and a compact metadata
 * strip (`CardMetaRow` — due / description / checklist / comments / members).
 * When `canEdit`, a quick "archive" action (hover icon → confirm dialog) is
 * available; the dialog `stopPropagation`s so it doesn't also open the card. All
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

  const archiveCard = useMutation(
    trpc.card.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        setArchiveOpen(false);
      },
    }),
  );

  const handleArchiveOpenChange = (next: boolean) => {
    if (archiveCard.isPending) return;
    setArchiveOpen(next);
    if (!next) archiveCard.reset();
  };

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

      <div className="font-medium leading-snug break-words line-clamp-3">{card.title}</div>

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
