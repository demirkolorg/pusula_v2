'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { comparePosition } from '@pusula/domain';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type MoveAllCardsDialogProps = {
  boardId: string;
  /** Kartları taşınacak kaynak liste. */
  fromListId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

/**
 * Bir listedeki tüm aktif kartları **aynı board içinde** başka listenin sonuna
 * taşıma diyalogu (2026-07-14; Trello "Move all cards in this list"). Hedef
 * listeler mevcut `board.get` cache'inden okunur (parent board ekranı zaten
 * yüklü) — kaynak liste ve arşivliler hariç, pozisyon sırasıyla.
 *
 * Toplu işlem düşük-sinyal (server activity/bildirim üretmez). Optimistic patch
 * yapılmaz — başarıda `board.get` invalidate edilir (realtime `list.cardsMoved`
 * diğer izleyicileri zaten tazeler); N-kart optimistic'in karmaşıklığı bu nadir
 * işlem için gereksiz.
 */
export function MoveAllCardsDialog({
  boardId,
  fromListId,
  open,
  onOpenChange,
}: MoveAllCardsDialogProps) {
  const copy = strings.board.moveAllCards;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [toListId, setToListId] = useState('');

  useEffect(() => {
    if (open) setToListId('');
  }, [open]);

  // Board zaten parent'ta yüklü — cache hit; yine de `enabled: open` ile güvenli.
  const boardQuery = useQuery(trpc.board.get.queryOptions({ boardId }, { enabled: open }));

  const moveAll = useMutation(
    trpc.list.moveAllCards.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        if (result.changed) toast.success(copy.success);
        onOpenChange(false);
      },
      onError: () => {
        toast.error(copy.error);
      },
    }),
  );

  // Hedef listeler: kaynak hariç, aktif, pozisyon sıralı.
  const targetLists = useMemo(
    () =>
      (boardQuery.data?.lists ?? [])
        .filter((l) => l.id !== fromListId && l.archivedAt == null)
        .sort((a, b) => comparePosition(a.position, b.position)),
    [boardQuery.data, fromListId],
  );

  // Kaynak listenin aktif kart sayısı — boşsa taşınacak bir şey yok.
  const sourceCardCount = useMemo(
    () =>
      (boardQuery.data?.cards ?? []).filter(
        (c) => c.listId === fromListId && c.archivedAt == null,
      ).length,
    [boardQuery.data, fromListId],
  );

  const canSubmit = toListId !== '' && sourceCardCount > 0 && !moveAll.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    moveAll.mutate({ boardId, fromListId, toListId });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!moveAll.isPending) onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={moveAll.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move-all-cards-list">{copy.listLabel}</Label>
              {sourceCardCount === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.empty}</p>
              ) : targetLists.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.noTargets}</p>
              ) : (
                <Select value={toListId} onValueChange={setToListId}>
                  <SelectTrigger id="move-all-cards-list" aria-label={copy.listLabel}>
                    <SelectValue placeholder={copy.listPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {targetLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {moveAll.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
