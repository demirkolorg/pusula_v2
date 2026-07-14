'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { boardRoleAtLeast } from '@pusula/domain';
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
import { applyListRemove, useOptimisticBoardMutation } from '@/lib/board-cache';

type MoveListToBoardDialogProps = {
  listId: string;
  /** Listenin şu anki panosu — optimistic çıkarma bu board.get cache'ine uygulanır. */
  currentBoardId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

/**
 * Listeyi tüm kartlarıyla başka bir panoya (cross-workspace dahil) taşıma
 * diyalogu (2026-07-14) — `MoveCardToBoardDialog` deseninin liste-adımsız
 * hali: Çalışma alanı → Pano seçimi; hedef panolar düzenleme yetkisine
 * (`member+`) filtrelenir, kaynak pano hariç tutulur (server `list.moveToBoard`
 * içinde yine enforce eder). Liste hedef panonun sonuna eklenir.
 *
 * Optimistic: liste (ve kartları) kaynak `board.get` cache'inden
 * `applyListRemove` ile çıkarılır (`useOptimisticBoardMutation` snapshot +
 * rollback sağlar); hedef pano cache'i başarıda invalidate edilir.
 */
export function MoveListToBoardDialog({
  listId,
  currentBoardId,
  open,
  onOpenChange,
}: MoveListToBoardDialogProps) {
  const copy = strings.board.moveListToBoard;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [workspaceId, setWorkspaceId] = useState('');
  const [boardId, setBoardId] = useState('');

  // Açılış geçişinde seçimi sıfırla — önceki oturumdan bayat seçim sızmasın.
  useEffect(() => {
    if (open) {
      setWorkspaceId('');
      setBoardId('');
    }
  }, [open]);

  const workspacesQuery = useQuery(trpc.workspace.list.queryOptions(undefined, { enabled: open }));
  const boardsQuery = useQuery(
    trpc.board.list.queryOptions({ workspaceId }, { enabled: open && workspaceId !== '' }),
  );

  const moveList = useOptimisticBoardMutation({
    mutationOptions: trpc.list.moveToBoard.mutationOptions,
    boardId: currentBoardId,
    // Kaynak panodan optimistic çıkar — liste kartlarıyla birlikte düşer.
    apply: (data, vars) => applyListRemove(data, vars.listId),
    onMutationSuccess: async (_result, vars) => {
      // Hedef pano açıksa taşınan listeyi görsün (kaynak board.get zaten
      // hook'un onSettled'ında invalidate edilir).
      await queryClient.invalidateQueries(
        trpc.board.get.queryFilter({ boardId: vars.toBoardId }),
      );
      toast.success(copy.success);
      onOpenChange(false);
    },
    onMutationError: () => {
      toast.error(copy.error);
    },
  });

  // Hedef panolar: aktif + düzenleme yetkisi (member+) + kaynak pano hariç.
  const boards = useMemo(
    () =>
      (boardsQuery.data ?? []).filter(
        (b) => b.archivedAt == null && b.id !== currentBoardId && boardRoleAtLeast(b.role, 'member'),
      ),
    [boardsQuery.data, currentBoardId],
  );

  const workspaces = workspacesQuery.data ?? [];
  const canSubmit = boardId !== '' && !moveList.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    // `clientMutationId` hook tarafından otomatik enjekte edilir; `boardId`
    // input alanı KAYNAK panodur (boardProcedure rolü ondan çözer).
    moveList.mutate({ boardId: currentBoardId, listId, toBoardId: boardId });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!moveList.isPending) onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pending sırasında seçiciler kilitli — in-flight pencerede hedef
              değiştirilemez ve çift-submit önlenir (MoveCardToBoardDialog
              `fieldset disabled` emsali). */}
          <fieldset disabled={moveList.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move-list-workspace">{copy.workspaceLabel}</Label>
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
                  }}
                >
                  <SelectTrigger id="move-list-workspace" aria-label={copy.workspaceLabel}>
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
              <Label htmlFor="move-list-board">{copy.boardLabel}</Label>
              {workspaceId === '' ? (
                <p className="text-muted-foreground text-sm">{copy.boardDisabledHint}</p>
              ) : boardsQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{copy.boardsLoading}</p>
              ) : boards.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.noEditableBoards}</p>
              ) : (
                <Select value={boardId} onValueChange={setBoardId}>
                  <SelectTrigger id="move-list-board" aria-label={copy.boardLabel}>
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
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {moveList.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
