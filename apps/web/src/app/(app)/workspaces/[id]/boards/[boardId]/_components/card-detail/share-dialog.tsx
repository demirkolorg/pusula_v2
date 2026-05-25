'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, Share2Icon } from 'lucide-react';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type ShareDialogProps = {
  cardId: string;
  /** Board admin/member görür; viewer için `false`. */
  canShare: boolean;
  /**
   * Kontrollü açık durumu. Verilirse dialog dışarıdan yönetilir (örn. kart
   * context menüsünden açılır); verilmezse kendi iç state'ini kullanır.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `true` ise gömülü "Paylaş" tetik düğmesi render edilmez (dışarıdan açılır). */
  hideTrigger?: boolean;
  /**
   * İkon-only varyant: card modal header'da label yerine Tooltip ile etiket
   * gösterir. `onColored` kapak rengi açıkken kontrast için.
   */
  iconOnly?: boolean;
  onColored?: boolean;
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
 *
 * Dialog hem gömülü tetik düğmesiyle (kart detay modalı) hem de kontrollü
 * modda (`open`/`onOpenChange` + `hideTrigger` — kart context menüsü) açılabilir.
 *
 * "Linke git": token DB'de yalnız SHA-256 hash olarak saklandığından
 * (`docs/architecture/14`) yalnız bu oturumda oluşturulan linkin URL'si
 * elimizdedir. O satırda buton aktif; eski satırlarda `disabled` + tooltip.
 */
export function ShareDialog({
  cardId,
  canShare,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  iconOnly = false,
  onColored = false,
}: ShareDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.share;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const [expiry, setExpiry] = useState<ExpiryPreset>(DEFAULT_EXPIRY);
  const [createdLink, setCreatedLink] = useState<{
    id: string;
    url: string;
    expiresAt: Date;
  } | null>(null);

  const linksQ = useQuery(trpc.share.list.queryOptions({ cardId }, { enabled: open }));

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.share.list.queryKey({ cardId }) });

  const createShare = useMutation(
    trpc.share.create.mutationOptions({
      onSuccess: (data) => {
        setCreatedLink({ id: data.id, url: data.url, expiresAt: data.expiresAt });
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
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
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

  const triggerButton = (disabled: boolean) =>
    iconOnly ? (
      <button
        type="button"
        disabled={disabled}
        aria-label={copy.action}
        className={cn(
          'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4',
          onColored
            ? 'text-current hover:bg-current/15'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <Share2Icon aria-hidden />
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label={copy.action}
      >
        <Share2Icon className="size-4" />
        {copy.action}
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            {canShare ? (
              <DialogTrigger asChild>{triggerButton(false)}</DialogTrigger>
            ) : (
              // Disabled <button> pointer event almadığından tooltip'in
              // tetiklenmesi için tetik olarak bir <span> sarmalayıcı kullanılır.
              <span tabIndex={0} className="inline-flex">
                {triggerButton(true)}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>
            {canShare ? copy.actionTooltip : copy.viewerDisabledTooltip}
          </TooltipContent>
        </Tooltip>
      )}
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
            data={linksQ.data}
            isLoading={linksQ.isLoading}
            isError={linksQ.isError}
            createdShareId={createdLink?.id ?? null}
            createdShareUrl={createdLink?.url ?? null}
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
  data: ShareLinkRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRevoke: (shareLinkId: string) => void;
  revokingId: string | null;
  /** Bu oturumda oluşturulan linkin id'si — "Linke git" yalnız bu satırda aktif. */
  createdShareId: string | null;
  /** Bu oturumda oluşturulan linkin tam URL'si. */
  createdShareUrl: string | null;
};

function ShareLinksList({
  data,
  isLoading,
  isError,
  onRevoke,
  revokingId,
  createdShareId,
  createdShareUrl,
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
              <div className="flex items-center gap-1 sm:shrink-0">
                <OpenLinkButton
                  url={row.id === createdShareId ? createdShareUrl : null}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revokingId === row.id}
                  onClick={() => onRevoke(row.id)}
                >
                  {revokingId === row.id ? copy.revoking : copy.revokeAction}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Aktif paylaşım satırındaki "Linke git" düğmesi. `url` yalnız bu oturumda
 * oluşturulan link için doludur (token tek-kullanımlık döner); diğer satırlarda
 * `null` gelir → düğme `disabled` + açıklayıcı tooltip.
 */
function OpenLinkButton({ url }: { url: string | null }) {
  const copy = strings.share.list;
  const available = url != null;
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!available}
      onClick={
        available
          ? () => window.open(url, '_blank', 'noopener,noreferrer')
          : undefined
      }
    >
      <ExternalLinkIcon className="size-4" aria-hidden />
      {copy.openLink}
    </Button>
  );
  if (available) return button;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        {/* Disabled <button> pointer event almaz; tooltip için <span> sarmalayıcı. */}
        <span tabIndex={0} className="inline-flex">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{copy.openLinkUnavailable}</TooltipContent>
    </Tooltip>
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
