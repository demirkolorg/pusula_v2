'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

type MoveBoardToWorkspaceDialogProps = {
  boardId: string;
  /** Panonun şu anki çalışma alanı — hedef listesinden hariç tutulur. */
  currentWorkspaceId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

/**
 * Panoyu başka bir çalışma alanına taşıma diyalogu (2026-07-13).
 *
 * Hedefler `workspace.list`'ten gelir: arşivsizler zaten filtreli; `guest`
 * rolü elenir (`board.moveToWorkspace` hedefte `member+` ister — server yine
 * enforce eder) ve mevcut çalışma alanı hariç tutulur. Optimistic patch yok —
 * taşıma URL'yi değiştiren nadir bir admin işlemi; başarıda kaynak/hedef
 * `board.list` + `workspace.list` + `board.get` invalidate edilir ve
 * `router.replace` ile panonun yeni canonical URL'sine geçilir (diğer
 * görüntüleyenleri realtime `board.movedToWorkspace` + board ekranının
 * canonical redirect'i taşır). `MoveCardToBoardDialog` deseni.
 */
export function MoveBoardToWorkspaceDialog({
  boardId,
  currentWorkspaceId,
  open,
  onOpenChange,
}: MoveBoardToWorkspaceDialogProps) {
  const copy = strings.board.moveToWorkspace;
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [workspaceId, setWorkspaceId] = useState('');

  // Açılış geçişinde seçimi sıfırla — önceki oturumdan bayat seçim sızmasın.
  useEffect(() => {
    if (open) setWorkspaceId('');
  }, [open]);

  const workspacesQuery = useQuery(trpc.workspace.list.queryOptions(undefined, { enabled: open }));

  const moveBoard = useMutation(
    trpc.board.moveToWorkspace.mutationOptions({
      onSuccess: async (result, vars) => {
        // Kaynak + hedef pano listeleri, çalışma alanı özetleri (pano sayısı)
        // ve panonun kendisi — taşınan workspaceId her yerde tazelensin.
        await Promise.all([
          queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
          queryClient.invalidateQueries(
            trpc.board.list.queryFilter({ workspaceId: currentWorkspaceId }),
          ),
          queryClient.invalidateQueries(
            trpc.board.list.queryFilter({ workspaceId: vars.toWorkspaceId }),
          ),
          queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
        ]);
        toast.success(copy.success);
        onOpenChange(false);
        // Board URL'si workspace segmenti taşır — panonun yeni canonical
        // adresine geç (history'ye eski workspace'li ara adım bırakma).
        router.replace(
          `/workspaces/${encodeURIComponent(result.workspaceId)}/boards/${encodeURIComponent(boardId)}`,
        );
      },
      onError: () => {
        toast.error(copy.error);
      },
    }),
  );

  // Hedefler: guest olmadığımız (member+), mevcut hariç çalışma alanları.
  const targets = useMemo(
    () =>
      (workspacesQuery.data ?? []).filter(
        (ws) => ws.id !== currentWorkspaceId && ws.role !== 'guest',
      ),
    [workspacesQuery.data, currentWorkspaceId],
  );

  const canSubmit = workspaceId !== '' && !moveBoard.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    moveBoard.mutate({
      boardId,
      toWorkspaceId: workspaceId,
      clientMutationId: crypto.randomUUID(),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!moveBoard.isPending) onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pending sırasında seçici kilitli — in-flight pencerede hedef
              değiştirilemez ve çift-submit önlenir (MoveCardToBoardDialog
              `fieldset disabled` emsali). */}
          <fieldset disabled={moveBoard.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move-board-workspace">{copy.workspaceLabel}</Label>
              {workspacesQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{copy.workspacesLoading}</p>
              ) : targets.length === 0 ? (
                <p className="text-muted-foreground text-sm">{copy.noTargets}</p>
              ) : (
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="move-board-workspace" aria-label={copy.workspaceLabel}>
                    <SelectValue placeholder={copy.workspacePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Alert>
              <AlertDescription>{copy.membersNote}</AlertDescription>
            </Alert>
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {moveBoard.isPending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
