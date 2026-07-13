'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { boardRoleAtLeast, comparePosition } from '@pusula/domain';
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
import { applyCardRemove, useOptimisticBoardMutation } from '@/lib/board-cache';

type MoveCardToBoardDialogProps = {
  cardId: string;
  /** Kartın şu anki panosu — optimistic çıkarma bu board.get cache'ine uygulanır. */
  currentBoardId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Taşıma başarıyla tamamlanınca çağrılır. Kart detay modalından açıldığında
   * modalı kapatmak için kullanılır (kart artık bu panoda değil).
   */
  onMoved?: () => void;
};

/**
 * Kartı başka bir panoya (board) — cross-workspace dahil — taşıma diyalogu.
 *
 * Backend `card.moveToList` hedef listenin başka board'da (hatta başka
 * workspace'te) olmasını zaten destekler (board-scope `card_labels` düşer,
 * üyeler korunur, iki board `version++`). Bu diyalog o yeteneği UI'a açar:
 * Çalışma alanı → Pano → Liste seçimi. Hedef panolar yalnız düzenleme yetkisi
 * (member+) olanlara filtrelenir (server yine enforce eder); kaynak pano hariç
 * tutulur (aynı-board taşıma kart context menüsündeki "Taşı" alt menüsünde).
 *
 * Optimistic: kart kaynak `board.get` cache'inden `applyCardRemove` ile
 * çıkarılır (`useOptimisticBoardMutation` snapshot + rollback sağlar); hedef
 * pano cache'i başarıda invalidate edilir. Kontrollü diyalog — hem kart context
 * menüsünden hem kart detay modalından açılır (`share-dialog.tsx` deseni).
 */
export function MoveCardToBoardDialog({
  cardId,
  currentBoardId,
  open,
  onOpenChange,
  onMoved,
}: MoveCardToBoardDialogProps) {
  const copy = strings.board.moveToBoard;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [workspaceId, setWorkspaceId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [listId, setListId] = useState('');

  // Açılış geçişinde seçimi sıfırla — önceki oturumdan bayat seçim sızmasın.
  useEffect(() => {
    if (open) {
      setWorkspaceId('');
      setBoardId('');
      setListId('');
    }
  }, [open]);

  const workspacesQuery = useQuery(
    trpc.workspace.list.queryOptions(undefined, { enabled: open }),
  );
  const boardsQuery = useQuery(
    trpc.board.list.queryOptions({ workspaceId }, { enabled: open && workspaceId !== '' }),
  );
  // NOT (bilinçli borç): liste adları için tam `board.get` çekilir — bu, hedef
  // panonun tüm kartlarını/üyelerini/kapak URL'lerini de getirir, biz yalnız
  // `lists`'i kullanırız. `list` router'ında boardId→listeler döndüren bir query
  // yok; hafif bir `list.list({ boardId })` eklenene dek bu over-fetch kabul
  // edilir (sonuç cache'lenir → aynı panoyu yeniden seçmek ucuz).
  const boardGetQuery = useQuery(
    trpc.board.get.queryOptions({ boardId }, { enabled: open && boardId !== '' }),
  );

  const moveCard = useOptimisticBoardMutation({
    mutationOptions: trpc.card.moveToList.mutationOptions,
    boardId: currentBoardId,
    // Kaynak panodan optimistic çıkar; board.get yalnız aktif kartları döndürür.
    apply: (data, vars) => applyCardRemove(data, vars.cardId),
    onMutationSuccess: async () => {
      // Hedef pano açıksa taşınan kartı görsün (kaynak board.get zaten
      // hook'un onSettled'ında invalidate edilir).
      await queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
      toast.success(copy.success);
      onOpenChange(false);
      onMoved?.();
    },
    onMutationError: () => {
      toast.error(copy.error);
    },
  });

  // Hedef panolar: aktif + düzenleme yetkisi (member+) + kaynak pano hariç.
  // `board.list` her pano için effective `role` (BoardRole) döndürür.
  const boards = useMemo(
    () =>
      (boardsQuery.data ?? []).filter(
        (b) => b.archivedAt == null && b.id !== currentBoardId && boardRoleAtLeast(b.role, 'member'),
      ),
    [boardsQuery.data, currentBoardId],
  );

  // Hedef panonun aktif listeleri, pozisyon sırasıyla.
  const lists = useMemo(
    () =>
      (boardGetQuery.data?.lists ?? [])
        .filter((l) => l.archivedAt == null)
        .sort((a, b) => comparePosition(a.position, b.position)),
    [boardGetQuery.data],
  );

  const workspaces = workspacesQuery.data ?? [];
  const canSubmit = listId !== '' && !moveCard.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    // `clientMutationId` hook tarafından otomatik enjekte edilir.
    moveCard.mutate({ cardId, toListId: listId });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!moveCard.isPending) onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pending sırasında tüm seçiciler kilitli: kullanıcı in-flight
              pencerede hedefi değiştiremez (aksi halde `onMutationSuccess`
              closure'ı yanlış board'un cache'ini invalidate ederdi) ve
              çift-submit önlenir (share-dialog `fieldset disabled` emsali). */}
          <fieldset disabled={moveCard.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move-to-board-workspace">{copy.workspaceLabel}</Label>
              {workspacesQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{copy.workspacesLoading}</p>
              ) : workspaces.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.workspacesEmpty}</p>
              ) : (
                <Select
                  value={workspaceId}
                  onValueChange={(value) => {
                    setWorkspaceId(value);
                    setBoardId('');
                    setListId('');
                  }}
                >
                  <SelectTrigger id="move-to-board-workspace" aria-label={copy.workspaceLabel}>
                    <SelectValue placeholder={copy.workspacePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="move-to-board-board">{copy.boardLabel}</Label>
              {workspaceId === '' ? (
                <p className="text-muted-foreground text-sm">{copy.boardDisabledHint}</p>
              ) : boardsQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{copy.boardsLoading}</p>
              ) : boards.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.noEditableBoards}</p>
              ) : (
                <Select
                  value={boardId}
                  onValueChange={(value) => {
                    setBoardId(value);
                    setListId('');
                  }}
                >
                  <SelectTrigger id="move-to-board-board" aria-label={copy.boardLabel}>
                    <SelectValue placeholder={copy.boardPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="move-to-board-list">{copy.listLabel}</Label>
              {boardId === '' ? (
                <p className="text-muted-foreground text-sm">{copy.listDisabledHint}</p>
              ) : boardGetQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{copy.listsLoading}</p>
              ) : lists.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.noLists}</p>
              ) : (
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger id="move-to-board-list" aria-label={copy.listLabel}>
                    <SelectValue placeholder={copy.listPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
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
              {moveCard.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
