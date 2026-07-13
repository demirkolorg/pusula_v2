'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';
import type { ApiKeyRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  cn,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { formatDate } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateBoardApiKeyDialog, type CreatedApiKeyToken } from './create-board-api-key-dialog';

/** A single API-key row as returned by `board.apiKeys.list` (metadata only — no token/hash). */
export type BoardApiKeyView = {
  id: string;
  name: string;
  tokenPrefix: string;
  role: ApiKeyRole;
  botName: string | null;
  expiresAt: Date | string | null;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
};

type BoardApiKeysSectionProps = {
  boardId: string;
};

/**
 * Board API-key management section (Public API + Bot Erişimi — Task 8). Loads
 * `board.apiKeys.list` (board admin only — the tab is mounted only for admins),
 * renders one {@link BoardApiKeyRow} per key and a "new key" flow: the
 * {@link CreateBoardApiKeyDialog} collects a bot name + role + optional expiry,
 * then reveals the plain token exactly once (the token lives here only until the
 * dialog closes). Revoking asks for confirmation first. No optimistic UI — a
 * low-frequency admin surface: mutation → await → invalidate → refetch.
 */
export function BoardApiKeysSection({ boardId }: BoardApiKeysSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.settings;

  const keys = useQuery(trpc.board.apiKeys.list.queryOptions({ boardId }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiKeyToken | null>(null);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const refetchKeys = () =>
    queryClient.invalidateQueries(trpc.board.apiKeys.list.queryFilter({ boardId }));

  const createKey = useMutation(
    trpc.board.apiKeys.create.mutationOptions({
      onSuccess: async (data) => {
        await refetchKeys();
        setCreatedToken({
          token: data.token,
          name: data.apiKey.name,
          tokenPrefix: data.apiKey.tokenPrefix,
        });
      },
    }),
  );

  const revokeKey = useMutation(
    trpc.board.apiKeys.revoke.mutationOptions({
      onSuccess: async () => {
        await refetchKeys();
        setActiveKeyId(null);
      },
      onError: (error, variables) => {
        setRowError({ id: variables.apiKeyId, message: error.message || strings.common.unknownError });
      },
    }),
  );

  const openCreate = () => {
    createKey.reset();
    setCreatedToken(null);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (createKey.isPending) return;
    if (!next) {
      // Closing clears the one-time token so it can never be shown again.
      setCreatedToken(null);
      createKey.reset();
    }
    setDialogOpen(next);
  };

  const handleCreateSubmit = (input: { name: string; role: ApiKeyRole; expiresAt?: Date }) => {
    createKey.reset();
    createKey.mutate({ boardId, ...input });
  };

  const handleRevoke = (apiKeyId: string) => {
    setRowError(null);
    setActiveKeyId(apiKeyId);
    revokeKey.mutate({ boardId, apiKeyId });
  };

  if (keys.isPending) {
    return <AppSpinner label={copy.apiKeysLoading} showLabel className="justify-start" />;
  }

  if (keys.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.apiKeysLoadErrorTitle}</AlertTitle>
        <AlertDescription>{keys.error.message || strings.common.unknownError}</AlertDescription>
      </Alert>
    );
  }

  const items = keys.data as BoardApiKeyView[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={openCreate}>
          <PlusIcon className="size-3.5" aria-hidden />
          {copy.apiKeyNewButton}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.apiKeysEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((apiKey) => (
            <li key={apiKey.id}>
              <BoardApiKeyRow
                apiKey={apiKey}
                pending={revokeKey.isPending && activeKeyId === apiKey.id}
                disabled={revokeKey.isPending}
                error={rowError?.id === apiKey.id ? rowError.message : null}
                onRevoke={() => handleRevoke(apiKey.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <CreateBoardApiKeyDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleCreateSubmit}
        pending={createKey.isPending}
        error={createKey.isError ? createKey.error.message || strings.common.unknownError : null}
        createdToken={createdToken}
      />
    </div>
  );
}

/** Resolve a nullable date-ish value to `null` (unset) or a `Date`. */
function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

type BoardApiKeyRowProps = {
  apiKey: BoardApiKeyView;
  /** A revoke for *this* row is in flight — shows the inline "…ediliyor…" text. */
  pending: boolean;
  /** Any revoke is in flight (possibly another row) — race guard. */
  disabled: boolean;
  error?: string | null;
  onRevoke: () => void;
};

/** Presentational API-key row: identity + prefix + role + usage/expiry + revoke. */
function BoardApiKeyRow({ apiKey, pending, disabled, error, onRevoke }: BoardApiKeyRowProps) {
  const copy = strings.board.settings;
  const revoked = apiKey.revokedAt != null;
  const expiresAt = toDate(apiKey.expiresAt);
  const lastUsedAt = toDate(apiKey.lastUsedAt);
  const expired = !revoked && expiresAt != null && expiresAt.getTime() < Date.now();
  const displayName = apiKey.name.trim() || apiKey.botName?.trim() || copy.apiKeysTitle;

  return (
    <div className={cn('space-y-2 rounded-lg border p-3', revoked && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BotIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="truncate font-medium">{displayName}</span>
          <Badge variant="secondary">{boardRoleLabels[apiKey.role]}</Badge>
          {revoked && <Badge variant="outline">{copy.apiKeyRevokedBadge}</Badge>}
          {expired && <Badge variant="destructive">{copy.apiKeyExpiredBadge}</Badge>}
        </div>

        {!revoked && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={disabled}>
                {pending ? copy.apiKeyRevoking : copy.apiKeyRevoke}
              </Button>
            }
            title={copy.apiKeyRevokeConfirmTitle}
            description={copy.apiKeyRevokeConfirmDescription}
            confirmLabel={copy.apiKeyRevokeConfirm}
            pending={disabled}
            onConfirm={onRevoke}
          />
        )}
      </div>

      <dl className="text-muted-foreground grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <KeyRoundIcon className="size-3" aria-hidden />
          <span className="font-medium">{copy.apiKeyPrefixLabel}:</span>
          <code className="font-mono">{apiKey.tokenPrefix}…</code>
        </div>
        <div>
          <span className="font-medium">{copy.apiKeyLastUsedLabel}:</span>{' '}
          {lastUsedAt ? formatDate(lastUsedAt) : copy.apiKeyLastUsedNever}
        </div>
        <div>
          <span className="font-medium">{copy.apiKeyExpiresAtLabel}:</span>{' '}
          {expiresAt ? formatDate(expiresAt) : copy.apiKeyExpiresNever}
        </div>
      </dl>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
};

/** Minimal destructive-action confirmation dialog (mirrors the board-member row). */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
