'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2Icon } from 'lucide-react';
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
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type ShareDialogProps = {
  cardId: string;
  /** Board admin/member görür; viewer için `false`. */
  canShare: boolean;
};

type ExpiryPreset = 7 | 30 | 90;
const DEFAULT_EXPIRY: ExpiryPreset = 90;
const EXPIRY_PRESETS: ExpiryPreset[] = [7, 30, 90];

/**
 * Faz 9D (DEM-130) — kart paylaşım dialogu.
 *
 * Üye: süre seç → "Bağlantı oluştur" → token bir kerelik response'ta görünür
 * + kopyala → aktif paylaşımlar listesi (iptal aksiyonu ile). Token plain
 * sadece `share.create` cevabında dönüldüğünden listede yalnız `tokenPrefix`
 * gösterilir. Viewer için "Paylaş" düğmesi `disabled` (önce-belge
 * `docs/domain/08-paylasim-linki-kurallari.md` "Kim oluşturabilir / iptal
 * edebilir").
 */
export function ShareDialog({ cardId, canShare }: ShareDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.share;

  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryPreset>(DEFAULT_EXPIRY);
  const [createdLink, setCreatedLink] = useState<{ url: string; expiresAt: Date } | null>(null);

  const linksQ = useQuery(trpc.share.list.queryOptions({ cardId }, { enabled: open }));

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.share.list.queryKey({ cardId }) });

  const createShare = useMutation(
    trpc.share.create.mutationOptions({
      onSuccess: (data) => {
        setCreatedLink({ url: data.url, expiresAt: data.expiresAt });
        invalidateList();
      },
      onError: () => {
        toast.error(copy.dialog.createError);
      },
    }),
  );

  const revokeShare = useMutation(
    trpc.share.revoke.mutationOptions({
      onSuccess: () => {
        invalidateList();
      },
      onError: () => {
        toast.error(copy.list.revokeError);
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (createShare.isPending) return;
    setOpen(next);
    if (!next) {
      setCreatedLink(null);
      setExpiry(DEFAULT_EXPIRY);
      createShare.reset();
    }
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      toast(copy.dialog.copied);
    } catch {
      toast.error(copy.dialog.copyFailed);
    }
  };

  const handleCreate = () => {
    createShare.mutate({
      cardId,
      expiresInDays: expiry,
      clientMutationId: crypto.randomUUID(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canShare}
          aria-label={copy.action}
          title={canShare ? copy.actionTooltip : copy.viewerDisabledTooltip}
        >
          <Share2Icon className="size-4" />
          {copy.action}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.dialog.title}</DialogTitle>
          <DialogDescription>{copy.dialog.description}</DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>{copy.dialog.createdHint}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input readOnly value={createdLink.url} aria-label={copy.dialog.createdTitle} />
              <Button type="button" onClick={handleCopy}>
                {copy.dialog.copyAction}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {copy.list.columnExpiresAt}: {formatExpires(createdLink.expiresAt)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset className="space-y-2" disabled={createShare.isPending}>
              <Label>{copy.dialog.expiryLabel}</Label>
              <RadioGroup
                value={String(expiry)}
                onValueChange={(v) => setExpiry(Number(v) as ExpiryPreset)}
                className="flex gap-4"
              >
                {EXPIRY_PRESETS.map((preset) => (
                  <div key={preset} className="flex items-center gap-2">
                    <RadioGroupItem value={String(preset)} id={`share-expiry-${preset}`} />
                    <Label htmlFor={`share-expiry-${preset}`} className="cursor-pointer">
                      {expiryLabel(preset)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <Button type="button" onClick={handleCreate} disabled={createShare.isPending}>
              {createShare.isPending ? copy.dialog.creating : copy.dialog.createAction}
            </Button>
          </div>
        )}

        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">{copy.list.title}</h3>
          <ShareLinksList
            cardId={cardId}
            data={linksQ.data}
            isLoading={linksQ.isLoading}
            isError={linksQ.isError}
            onRevoke={(shareLinkId) =>
              revokeShare.mutate({
                cardId,
                shareLinkId,
                clientMutationId: crypto.randomUUID(),
              })
            }
            revokingId={
              revokeShare.isPending
                ? (revokeShare.variables?.shareLinkId ?? null)
                : null
            }
          />
        </section>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {copy.dialog.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ShareLinkRow = {
  id: string;
  tokenPrefix: string;
  createdById: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedById: string | null;
  accessCount: number;
  lastAccessedAt: Date | null;
};

type ShareLinksListProps = {
  cardId: string;
  data: ShareLinkRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRevoke: (shareLinkId: string) => void;
  revokingId: string | null;
};

function ShareLinksList({
  data,
  isLoading,
  isError,
  onRevoke,
  revokingId,
}: ShareLinksListProps) {
  const copy = strings.share.list;
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{copy.loading}</p>;
  }
  if (isError) {
    return <p className="text-destructive text-sm">{copy.loadError}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm">{copy.empty}</p>;
  }
  return (
    <ul className="divide-y rounded-md border text-sm">
      {data.map((row) => {
        const revoked = row.revokedAt != null;
        return (
          <li
            key={row.id}
            className={`flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
              revoked ? 'opacity-60' : ''
            }`}
            data-testid="share-link-row"
            data-revoked={revoked ? 'true' : 'false'}
          >
            <div className="flex flex-col">
              <span className="font-mono text-xs">
                {row.tokenPrefix}…{' '}
                {revoked && (
                  <span className="text-destructive ml-1 text-[10px] uppercase">
                    {copy.revokedBadge}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {copy.columnAccessCount}: {row.accessCount}
                {row.lastAccessedAt
                  ? ` · ${copy.columnLastAccessed}: ${formatExpires(row.lastAccessedAt)}`
                  : ` · ${copy.neverAccessed}`}
                {' · '}
                {copy.columnExpiresAt}: {formatExpires(row.expiresAt)}
              </span>
            </div>
            {!revoked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={revokingId === row.id}
                onClick={() => onRevoke(row.id)}
              >
                {revokingId === row.id ? copy.revoking : copy.revokeAction}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function expiryLabel(days: ExpiryPreset): string {
  const copy = strings.share.dialog;
  switch (days) {
    case 7:
      return copy.expiry7;
    case 30:
      return copy.expiry30;
    case 90:
    default:
      return copy.expiry90;
  }
}

function formatExpires(date: Date): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
