'use client';

import { useEffect, useState } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyPlusIcon,
  LinkIcon,
  ListIcon,
  MoreHorizontalIcon,
  MoveIcon,
  XIcon,
} from 'lucide-react';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  type PaletteName,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CardCoverImage, type CoverImage } from '../card-cover-image';
import { CardDetailSnooze } from './card-detail-snooze';

const PALETTE_BAR: Record<PaletteName, string> = {
  kirmizi: 'bg-palet-kirmizi text-palet-kirmizi-foreground',
  turuncu: 'bg-palet-turuncu text-palet-turuncu-foreground',
  sari: 'bg-palet-sari text-palet-sari-foreground',
  lime: 'bg-palet-lime text-palet-lime-foreground',
  yesil: 'bg-palet-yesil text-palet-yesil-foreground',
  sky: 'bg-palet-sky text-palet-sky-foreground',
  mavi: 'bg-palet-mavi text-palet-mavi-foreground',
  indigo: 'bg-palet-indigo text-palet-indigo-foreground',
  mor: 'bg-palet-mor text-palet-mor-foreground',
  pembe: 'bg-palet-pembe text-palet-pembe-foreground',
  gri: 'bg-palet-gri text-palet-gri-foreground',
  siyah: 'bg-palet-siyah text-palet-siyah-foreground',
};

type CardModalHeaderProps = {
  /** Faz 10H (DEM-142) — snooze dropdown'ı için gerekli. */
  cardId: string;
  boardName: string | null;
  listName: string | null;
  /** Cover image metadata; when present, the image band takes precedence over `coverColor`. */
  coverImage?: CoverImage | null;
  /** Server-side üretilmiş kapak görseli presigned URL (`card.get` — DEM-227). */
  coverImageUrl?: string | null;
  /** Cover colour for the bar; `null` ⇒ plain `bg-background border-b` variant (DEM-67 not landed). */
  coverColor?: PaletteName | null;
  /** Whether the card is archived (affects the ⋮ menu's archive/restore item). */
  archived: boolean;
  /** Whether the viewer may archive/restore (board `member+`, board/list active). */
  canArchive: boolean;
  archivePending?: boolean;
  onArchiveToggle: (archived: boolean) => void;
  onClose: () => void;
};

/**
 * Card modal top bar: list/board breadcrumb on the left; notifications (disabled
 * placeholder — DEM not landed), copy-deep-link, a ⋮ menu (move/copy disabled
 * placeholders; archive/restore wired), and the close button on the right. The
 * cover-colour variant is wired but always renders plain until DEM-67 ships
 * `cards.coverColor` — `coverColor` defaults to `null`.
 */
export function CardModalHeader({
  cardId,
  boardName,
  listName,
  coverImage = null,
  coverImageUrl = null,
  coverColor = null,
  archived,
  canArchive,
  archivePending = false,
  onArchiveToggle,
  onClose,
}: CardModalHeaderProps) {
  const copy = strings.card.detail.modal;
  const [copied, setCopied] = useState(false);
  const hasCoverImage = coverImage != null;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const coverClass =
    !hasCoverImage && coverColor ? PALETTE_BAR[coverColor] : 'bg-background border-b';
  const onColored = !hasCoverImage && coverColor != null;

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
    } catch {
      // clipboard may be unavailable (e.g. insecure context) — fail quietly
    }
  };

  return (
    <div className="shrink-0">
      {coverImage ? (
        <div data-slot="card-modal-cover-image" className="h-40 overflow-hidden border-b bg-muted">
          <CardCoverImage
            coverImageUrl={coverImageUrl}
            alt={coverImage.fileName}
            className="h-full"
          />
        </div>
      ) : null}
      <div
        data-slot="card-modal-header"
        className={cn('flex items-center justify-between gap-2 px-4 py-2.5', coverClass)}
      >
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-xs',
            onColored ? 'text-current/80' : 'text-muted-foreground',
          )}
        >
          <ListIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {boardName?.trim() || copy.breadcrumbBoard} <span aria-hidden>/</span>{' '}
            {listName?.trim() || copy.breadcrumbList}
          </span>
          {archived && (
            <Badge
              variant="outline"
              className={cn('ml-1 shrink-0', onColored && 'border-current/40 text-current')}
            >
              {copy.archivedBadge}
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {/* Faz 10H (DEM-142) — Snooze dropdown. Bell ikonu artık aktif:
              kullanıcı kartı 1s/4s/1g/1h/belirli tarihe kadar susturabilir. */}
          <CardDetailSnooze cardId={cardId} onColored={onColored} />

          {/* Copy deep link. */}
          <Tooltip open={copied ? true : undefined}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copyLink}
                aria-label={copy.copyLink}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-4',
                  onColored
                    ? 'text-current hover:bg-current/15'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <LinkIcon aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{copied ? copy.linkCopied : copy.copyLink}</TooltipContent>
          </Tooltip>
          <span className="sr-only" aria-live="polite">
            {copied ? copy.linkCopied : ''}
          </span>

          {/* ⋮ menu — move/copy are disabled placeholders; archive/restore wired. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={copy.more}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-4',
                  onColored
                    ? 'text-current hover:bg-current/15'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <MoreHorizontalIcon aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem disabled>
                <MoveIcon aria-hidden />
                {copy.menuMove}
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <CopyPlusIcon aria-hidden />
                {copy.menuCopy}
              </DropdownMenuItem>
              {canArchive && (
                <>
                  <DropdownMenuSeparator />
                  {archived ? (
                    <DropdownMenuItem
                      disabled={archivePending}
                      onSelect={(e) => {
                        e.preventDefault();
                        onArchiveToggle(false);
                      }}
                    >
                      <ArchiveRestoreIcon aria-hidden />
                      {copy.menuRestore}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={archivePending}
                      onSelect={(e) => {
                        e.preventDefault();
                        onArchiveToggle(true);
                      }}
                    >
                      <ArchiveIcon aria-hidden />
                      {copy.menuArchive}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span
            aria-hidden
            className={cn('mx-0.5 h-5 w-px', onColored ? 'bg-current/20' : 'bg-border')}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label={strings.card.detail.close}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-4',
              onColored
                ? 'text-current hover:bg-current/15'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <XIcon aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
