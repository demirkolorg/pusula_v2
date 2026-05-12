'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

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
};

type CardItemProps = {
  boardId: string;
  card: BoardCard;
  /** Whether the viewer may edit/archive this card (board `member+`, list & board active). */
  canEdit: boolean;
};

/**
 * A single card chip in a list column. Clicking the title navigates to
 * `?card=<id>` (shallow), which opens the card detail modal (board page renders
 * `CardDetailRoute`); title / description / due editing now lives there. When
 * `canEdit`, a quick "archive" action (small confirm dialog) is still available
 * here. All mutations invalidate `board.get`.
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
    <div className="bg-card rounded-md border p-2 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={openCard}
          className="hover:text-primary flex-1 text-left text-sm font-medium break-words"
        >
          {card.title}
        </button>
        {canEdit && (
          <Dialog open={archiveOpen} onOpenChange={handleArchiveOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={copy.archive}>
                {copy.archive}
              </Button>
            </DialogTrigger>
            <DialogContent>
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
      </div>

      {card.dueAt != null && (
        <div className="mt-2">
          <Badge variant="outline">
            {copy.dueLabel}: {formatDate(card.dueAt)}
          </Badge>
        </div>
      )}
    </div>
  );
}
