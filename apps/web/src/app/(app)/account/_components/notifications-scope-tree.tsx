'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCardIcon, KanbanSquareIcon, LayersIcon, PlusIcon, TrashIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
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
import { NotificationsScopeAddDialog } from './notifications-scope-add-dialog';
import type { MuteLevel } from './notifications-shared';

/**
 * Section 3 — Workspace / Board / Card scope override ağacı (Faz 10D / DEM-138).
 *
 * `notifications.preferences.list()` tüm scope satırlarını döner; backend
 * `scopeLabel` (workspace adı / board adı / kart başlığı) JOIN ile ekler ve
 * sıralamayı global → workspace → board → card hiyerarşisinde yapar.
 *
 * UI:
 *   - Global default (üçü null) burada gösterilmez (Section 1 yönetir; backend
 *     server-side sıralama global'i en başa atsa da `kind === 'global'`
 *     satırlarını client-side eler).
 *   - Her satırda: tip ikonu + scope etiketi + inline mute-level Select +
 *     email/push Switch + "Kaldır" buton (delete mutation).
 *   - "+ Yeni kapsam ekle" buton → NotificationsScopeAddDialog.
 *
 * Optimistic UI: `delete` mutation `onMutate` listeyi filtreler; `upsert`
 * (inline mute-level değişimi) `onMutate` ilgili satırı `setData` ile günceller;
 * `onError` snapshot rollback; `onSettled` `list` invalidate.
 */
export function NotificationsScopeTree() {
  const copy = strings.account.notifications;
  const scopesCopy = copy.scopes;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);

  const listQueryFilter = useMemo(
    () => trpc.notifications.preferences.list.queryFilter(),
    [trpc],
  );
  const getQueryFilter = useMemo(
    () => trpc.notifications.preferences.get.queryFilter(),
    [trpc],
  );
  const listQuery = useQuery(trpc.notifications.preferences.list.queryOptions());

  const deleteMutation = useMutation(
    trpc.notifications.preferences.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listQueryFilter);
        const previous = queryClient.getQueryData<ScopeListData>(listQueryFilter.queryKey);
        queryClient.setQueryData<ScopeListData>(listQueryFilter.queryKey, (old) =>
          (old ?? []).filter((row) => !matchesScope(row, input)),
        );
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context) {
          queryClient.setQueryData(listQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.errors.deleteFailed);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listQueryFilter);
        void queryClient.invalidateQueries(getQueryFilter);
      },
    }),
  );

  const upsertMutation = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listQueryFilter);
        const previous = queryClient.getQueryData<ScopeListData>(listQueryFilter.queryKey);
        queryClient.setQueryData<ScopeListData>(listQueryFilter.queryKey, (old) =>
          (old ?? []).map((row) =>
            matchesScope(row, input)
              ? {
                  ...row,
                  muteLevel: input.muteLevel,
                  mentionOnly: input.mentionOnly,
                  pushEnabled: input.pushEnabled,
                  emailEnabled: input.emailEnabled,
                  updatedAt: new Date(),
                }
              : row,
          ),
        );
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context) {
          queryClient.setQueryData(listQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.errors.saveFailed);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listQueryFilter);
        void queryClient.invalidateQueries(getQueryFilter);
      },
    }),
  );

  const isLoading = listQuery.isPending;
  const isError = listQuery.isError;
  const allRows = listQuery.data ?? [];
  // Section 1 zaten global default'u yönetir; ağaçta yeniden gösterme.
  const overrideRows = allRows.filter((row) => scopeKind(row) !== 'global');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayersIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{scopesCopy.title}</CardTitle>
        </div>
        <CardDescription>{scopesCopy.narrowestWins}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-muted-foreground text-sm">{scopesCopy.loading}</p>}
        {isError && <p className="text-destructive text-sm">{scopesCopy.loadFailed}</p>}
        {!isLoading && !isError && overrideRows.length === 0 && (
          <EmptyState
            message={
              <span className="flex flex-col items-center gap-1">
                <span>{scopesCopy.empty}</span>
                <span className="text-muted-foreground text-xs">
                  {scopesCopy.cardOverrideNote}
                </span>
              </span>
            }
          />
        )}
        {!isLoading && !isError && overrideRows.length > 0 && (
          <ul className="divide-border divide-y">
            {overrideRows.map((row) => (
              <ScopeRow
                key={row.id}
                row={row}
                disabled={
                  upsertMutation.isPending ||
                  (deleteMutation.isPending && matchesScope(row, deleteMutation.variables ?? {}))
                }
                onMuteLevelChange={(level) =>
                  upsertMutation.mutate({
                    workspaceId: row.workspaceId ?? undefined,
                    boardId: row.boardId ?? undefined,
                    cardId: row.cardId ?? undefined,
                    muteLevel: level,
                    mentionOnly: row.mentionOnly,
                    pushEnabled: row.pushEnabled,
                    emailEnabled: row.emailEnabled,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
                onChannelToggle={(channel, value) =>
                  upsertMutation.mutate({
                    workspaceId: row.workspaceId ?? undefined,
                    boardId: row.boardId ?? undefined,
                    cardId: row.cardId ?? undefined,
                    muteLevel: row.muteLevel,
                    mentionOnly: row.mentionOnly,
                    pushEnabled: channel === 'push' ? value : row.pushEnabled,
                    emailEnabled: channel === 'email' ? value : row.emailEnabled,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
                onRemove={() =>
                  deleteMutation.mutate({
                    workspaceId: row.workspaceId ?? undefined,
                    boardId: row.boardId ?? undefined,
                    cardId: row.cardId ?? undefined,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
              />
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon aria-hidden className="mr-1 size-4" />
            {scopesCopy.addNew}
          </Button>
        </div>
      </CardContent>
      <NotificationsScopeAddDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}

type ScopeKindValue = 'global' | 'workspace' | 'board' | 'card';
type ScopeRow = {
  id: string;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  muteLevel: MuteLevel;
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  /** Faz 10F (DEM-140) — yalnız global satırı taşır; override satırlarında null. */
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
  /** Faz 10H (DEM-142) — kart-scope satırlarında snooze bitiş zamanı. */
  muteUntil: Date | null;
  /** Faz 10G (DEM-141) — yalnız global satırda anlamlı; DB default 'instant'. */
  emailMode: string;
  /** superjson serializes Date round-trip; we treat it as Date for cache parity. */
  updatedAt: Date;
  scopeLabel: string;
};
type ScopeListData = ScopeRow[];

function scopeKind(row: { workspaceId: string | null; boardId: string | null; cardId: string | null }): ScopeKindValue {
  if (row.cardId) return 'card';
  if (row.boardId) return 'board';
  if (row.workspaceId) return 'workspace';
  return 'global';
}

function matchesScope(
  row: { workspaceId: string | null; boardId: string | null; cardId: string | null },
  input: { workspaceId?: string; boardId?: string; cardId?: string },
): boolean {
  return (
    (row.workspaceId ?? null) === (input.workspaceId ?? null) &&
    (row.boardId ?? null) === (input.boardId ?? null) &&
    (row.cardId ?? null) === (input.cardId ?? null)
  );
}

type ScopeRowProps = {
  row: ScopeRow;
  disabled: boolean;
  onMuteLevelChange: (level: MuteLevel) => void;
  onChannelToggle: (channel: 'email' | 'push', value: boolean) => void;
  onRemove: () => void;
};

function ScopeRow({
  row,
  disabled,
  onMuteLevelChange,
  onChannelToggle,
  onRemove,
}: ScopeRowProps) {
  const copy = strings.account.notifications;
  const scopesCopy = copy.scopes;
  const kind = scopeKind(row);

  const Icon = kind === 'card' ? CreditCardIcon : kind === 'board' ? KanbanSquareIcon : LayersIcon;
  const kindLabel =
    kind === 'card'
      ? scopesCopy.scopeKind.card
      : kind === 'board'
        ? scopesCopy.scopeKind.board
        : scopesCopy.scopeKind.workspace;

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="shrink-0">
              {kindLabel}
            </Badge>
            <span className="truncate text-sm font-medium" title={row.scopeLabel}>
              {row.scopeLabel}
            </span>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            <span>{row.emailEnabled ? scopesCopy.emailOn : scopesCopy.emailOff}</span>
            <span>·</span>
            <span>{row.pushEnabled ? scopesCopy.pushOn : scopesCopy.pushOff}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={row.muteLevel}
          onValueChange={(value) => onMuteLevelChange(value as MuteLevel)}
          disabled={disabled}
        >
          <SelectTrigger
            id={`scope-mute-${row.id}`}
            aria-label={copy.mute.title}
            className="h-8 w-[180px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{copy.mute.none}</SelectItem>
            <SelectItem value="mentions_only">{copy.mute.mentionsOnly}</SelectItem>
            <SelectItem value="all">{copy.mute.all}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Switch
            id={`scope-email-${row.id}`}
            checked={row.emailEnabled}
            disabled={disabled}
            aria-label={`${row.scopeLabel} ${copy.channels.email}`}
            onCheckedChange={(value) => onChannelToggle('email', value)}
          />
          <span className="text-muted-foreground text-xs">{copy.channels.email}</span>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            id={`scope-push-${row.id}`}
            checked={row.pushEnabled}
            disabled={disabled}
            aria-label={`${row.scopeLabel} ${copy.channels.push}`}
            onCheckedChange={(value) => onChannelToggle('push', value)}
          />
          <span className="text-muted-foreground text-xs">{copy.channels.push}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={scopesCopy.removeOverrideAriaLabel.replace('{scope}', row.scopeLabel)}
          className="text-muted-foreground hover:text-foreground"
        >
          <TrashIcon aria-hidden className="mr-1 size-4" />
          {disabled ? scopesCopy.removing : scopesCopy.removeOverride}
        </Button>
      </div>
    </li>
  );
}
