'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { PREFERENCE_DEFAULTS, type MuteLevel } from './notifications-shared';

/**
 * Section 3 — "Yeni kapsam ekle" diyalogu (Faz 10D / DEM-138).
 *
 * Kapsam: Faz 10D dialog'u SADECE workspace + board scope override desteği
 * ekler. Card override'ı Faz 10H (snooze) sırasında kart detay menüsünden
 * eklenir; bu dialog'da kart adımı olmaz (binlerce kart = tek seferde
 * fetch edilemez Combobox; kart detayında inline aksiyon UX'e daha uygun).
 * Kart override satırı `notifications-scope-tree.tsx` içinde HÂLÂ listelenir
 * ve "Kaldır" butonu ile silinebilir.
 *
 * Akış:
 *   1. Kapsam türü seç: workspace ya da board (RadioGroup)
 *   2. Workspace seç (Select; trpc.workspace.list)
 *   3. Eğer board seçildiyse: workspace'in panolarından birini seç
 *      (Select; trpc.board.list({workspaceId}))
 *   4. Tercih: muteLevel RadioGroup + email/push Switch
 *   5. [Oluştur] → trpc.notifications.preferences.upsert
 */

type NotificationsScopeAddDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

type ScopeKind = 'workspace' | 'board';

export function NotificationsScopeAddDialog({
  open,
  onOpenChange,
}: NotificationsScopeAddDialogProps) {
  const copy = strings.account.notifications;
  const dialogCopy = copy.addDialog;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('workspace');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [boardId, setBoardId] = useState<string>('');
  const [muteLevel, setMuteLevel] = useState<MuteLevel>(PREFERENCE_DEFAULTS.muteLevel);
  const [emailEnabled, setEmailEnabled] = useState<boolean>(PREFERENCE_DEFAULTS.emailEnabled);
  const [pushEnabled, setPushEnabled] = useState<boolean>(PREFERENCE_DEFAULTS.pushEnabled);

  // Reset form on open transitions so a stale selection from the previous
  // open doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setScopeKind('workspace');
      setWorkspaceId('');
      setBoardId('');
      setMuteLevel(PREFERENCE_DEFAULTS.muteLevel);
      setEmailEnabled(PREFERENCE_DEFAULTS.emailEnabled);
      setPushEnabled(PREFERENCE_DEFAULTS.pushEnabled);
    }
  }, [open]);

  const workspacesQuery = useQuery(
    trpc.workspace.list.queryOptions(undefined, { enabled: open }),
  );

  const boardsQuery = useQuery(
    trpc.board.list.queryOptions(
      { workspaceId },
      { enabled: open && scopeKind === 'board' && workspaceId !== '' },
    ),
  );

  const listQueryFilter = useMemo(
    () => trpc.notifications.preferences.list.queryFilter(),
    [trpc],
  );
  const getQueryFilter = useMemo(
    () => trpc.notifications.preferences.get.queryFilter(),
    [trpc],
  );

  const upsert = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
      },
      onError: (err) => {
        // Conflict (unique violation surfaced via TRPCError 'CONFLICT' or
        // unhandled — we surface the duplicate hint either way; the upsert
        // server already gracefully handles concurrent races, so a real
        // CONFLICT here means the loser of a parallel upsert lost the
        // window between cache-miss and INSERT).
        const message =
          (err as { data?: { code?: string }; message?: string })?.data?.code === 'CONFLICT'
            ? dialogCopy.duplicateError
            : copy.errors.saveFailed;
        toast.error(message);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listQueryFilter);
        void queryClient.invalidateQueries(getQueryFilter);
      },
    }),
  );

  const canSubmit =
    workspaceId !== '' &&
    (scopeKind === 'workspace' || (scopeKind === 'board' && boardId !== '')) &&
    !upsert.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    upsert.mutate({
      workspaceId: scopeKind === 'workspace' ? workspaceId : undefined,
      boardId: scopeKind === 'board' ? boardId : undefined,
      muteLevel,
      mentionOnly: false,
      emailEnabled,
      pushEnabled,
      clientMutationId: crypto.randomUUID(),
    });
  };

  const workspaces = workspacesQuery.data ?? [];
  const boards = boardsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{dialogCopy.title}</DialogTitle>
          <DialogDescription>{dialogCopy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{dialogCopy.scopeKindLabel}</legend>
            <RadioGroup
              value={scopeKind}
              onValueChange={(value) => {
                setScopeKind(value as ScopeKind);
                setBoardId('');
              }}
              aria-label={dialogCopy.scopeKindLabel}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="workspace" id="scope-kind-workspace" />
                <Label htmlFor="scope-kind-workspace" className="font-normal">
                  {dialogCopy.scopeKindWorkspace}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="board" id="scope-kind-board" />
                <Label htmlFor="scope-kind-board" className="font-normal">
                  {dialogCopy.scopeKindBoard}
                </Label>
              </div>
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="scope-workspace">{dialogCopy.workspaceLabel}</Label>
            {workspacesQuery.isPending ? (
              <p className="text-muted-foreground text-sm">{dialogCopy.workspacesLoading}</p>
            ) : workspaces.length === 0 ? (
              <p className="text-muted-foreground text-sm">{dialogCopy.workspacesEmpty}</p>
            ) : (
              <Select
                value={workspaceId}
                onValueChange={(value) => {
                  setWorkspaceId(value);
                  setBoardId('');
                }}
              >
                <SelectTrigger id="scope-workspace" aria-label={dialogCopy.workspaceLabel}>
                  <SelectValue placeholder={dialogCopy.workspacePlaceholder} />
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

          {scopeKind === 'board' && (
            <div className="space-y-2">
              <Label htmlFor="scope-board">{dialogCopy.boardLabel}</Label>
              {workspaceId === '' ? (
                <p className="text-muted-foreground text-sm">{dialogCopy.boardDisabledHint}</p>
              ) : boardsQuery.isPending ? (
                <p className="text-muted-foreground text-sm">{dialogCopy.boardsLoading}</p>
              ) : boards.length === 0 ? (
                <p className="text-muted-foreground text-sm">{dialogCopy.boardsEmpty}</p>
              ) : (
                <Select value={boardId} onValueChange={setBoardId}>
                  <SelectTrigger id="scope-board" aria-label={dialogCopy.boardLabel}>
                    <SelectValue placeholder={dialogCopy.boardPlaceholder} />
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
          )}

          <fieldset className="space-y-3 border-t pt-3">
            <legend className="text-sm font-medium">{dialogCopy.preferenceTitle}</legend>
            <RadioGroup
              value={muteLevel}
              onValueChange={(value) => setMuteLevel(value as MuteLevel)}
              aria-label={copy.mute.title}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="none" id="dialog-mute-none" />
                <Label htmlFor="dialog-mute-none" className="font-normal">
                  {copy.mute.none}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="mentions_only" id="dialog-mute-mentions" />
                <Label htmlFor="dialog-mute-mentions" className="font-normal">
                  {copy.mute.mentionsOnly}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="dialog-mute-all" />
                <Label htmlFor="dialog-mute-all" className="font-normal">
                  {copy.mute.all}
                </Label>
              </div>
            </RadioGroup>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="dialog-email" className="font-normal">
                {copy.channels.email}
              </Label>
              <Switch
                id="dialog-email"
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="dialog-push" className="font-normal">
                {copy.channels.push}
              </Label>
              <Switch
                id="dialog-push"
                checked={pushEnabled}
                onCheckedChange={setPushEnabled}
              />
            </div>
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {dialogCopy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {upsert.isPending ? dialogCopy.submitting : dialogCopy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
