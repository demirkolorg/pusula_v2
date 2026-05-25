'use client';

import { useEffect, useState } from 'react';
import {
  LinkIcon,
  ListIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from 'lucide-react';
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  type PaletteName,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CardReportsButton } from '@/components/reports/entity-tab/card-reports-button';
import { CardCoverImage, type CoverImage } from '../card-cover-image';
import { CardDetailSnooze } from './card-detail-snooze';
import { ShareDialog } from './share-dialog';

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
  /** Kart raporu butonunun ihtiyaç duyduğu pano kimliği. */
  boardId: string;
  /** Paylaş butonu erişimi — board admin/member için `true`, viewer için `false`. */
  canShare: boolean;
  boardName: string | null;
  listName: string | null;
  /** Cover image metadata; when present, the image band takes precedence over `coverColor`. */
  coverImage?: CoverImage | null;
  /** Server-side üretilmiş kapak görseli presigned URL (`card.get` — DEM-227). */
  coverImageUrl?: string | null;
  /** Cover colour for the bar; `null` ⇒ plain `bg-background border-b` variant (DEM-67 not landed). */
  coverColor?: PaletteName | null;
  /** Arşivli rozet için. Arşiv aksiyonu artık modal header'da değil. */
  archived: boolean;
  /** Sağ panel (yorum/aktivite/ekler) açık mı — toggle butonunun durumunu sürer. */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

/**
 * Card modal top bar: list/board breadcrumb on the left; rapor, paylaş, snooze,
 * copy-deep-link ve sağ panel toggle butonları sağda. Tüm aksiyon butonları
 * yalnız ikon — etiketleri shadcn/ui Tooltip ile gösterilir. Modal kapatma
 * Escape veya backdrop ile yapılır (X butonu yok). Arşiv aksiyonu modal
 * header'dan çıkarıldı — kart liste seviyesinden veya başka yerden tetiklenmeli.
 */
export function CardModalHeader({
  cardId,
  boardId,
  canShare,
  boardName,
  listName,
  coverImage = null,
  coverImageUrl = null,
  coverColor = null,
  archived,
  sidebarOpen,
  onToggleSidebar,
}: CardModalHeaderProps) {
  const copy = strings.card.detail.modal;
  const [copied, setCopied] = useState(false);
  // Banner arka planı için görselin 1×1 örneklenmiş baskın rengi (CardCoverImage
  // callback'i). CORS engeli halinde `null` kalır ve `bg-muted` fallback görünür.
  const [coverBg, setCoverBg] = useState<string | null>(null);
  const hasCoverImage = coverImage != null;

  // Kart/görsel değiştiğinde önceki rengi sıfırla; yeni görsel yüklenene dek
  // banner fallback `bg-muted` üzerinde döner.
  useEffect(() => {
    setCoverBg(null);
  }, [coverImage?.attachmentId]);

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

  const iconBtnClass = cn(
    'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-4',
    onColored
      ? 'text-current hover:bg-current/15'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  );

  return (
    <div className="shrink-0">
      {coverImage ? (
        <div
          data-slot="card-modal-cover-image"
          className="flex h-56 items-center justify-center overflow-hidden border-b bg-muted transition-colors duration-300"
          style={coverBg ? { backgroundColor: coverBg } : undefined}
        >
          <CardCoverImage
            coverImageUrl={coverImageUrl}
            alt={coverImage.fileName}
            fit="contain"
            className="h-full w-full"
            onDominantColor={setCoverBg}
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

        <div className="flex shrink-0 items-center gap-1">
          {/* Faz 13G (DEM-263) — kart raporu composer'ını açan ikon buton. */}
          <CardReportsButton
            cardId={cardId}
            boardId={boardId}
            iconOnly
            onColored={onColored}
          />

          {/* Faz 9D (DEM-130) — paylaşım dialogu ikon buton. */}
          <ShareDialog cardId={cardId} canShare={canShare} iconOnly onColored={onColored} />

          {/* Faz 10H (DEM-142) — Snooze dropdown (icon-only). */}
          <CardDetailSnooze cardId={cardId} onColored={onColored} />

          {/* Copy deep link. */}
          <Tooltip open={copied ? true : undefined}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copyLink}
                aria-label={copied ? copy.linkCopied : copy.copyLink}
                className={iconBtnClass}
              >
                <LinkIcon aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{copied ? copy.linkCopied : copy.copyLink}</TooltipContent>
          </Tooltip>
          <span className="sr-only" aria-live="polite">
            {copied ? copy.linkCopied : ''}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-pressed={sidebarOpen}
                aria-label={sidebarOpen ? copy.sidebarClose : copy.sidebarOpen}
                className={cn(
                  iconBtnClass,
                  sidebarOpen && (onColored ? 'bg-current/15' : 'bg-accent text-foreground'),
                )}
              >
                {sidebarOpen ? (
                  <PanelRightCloseIcon aria-hidden />
                ) : (
                  <PanelRightOpenIcon aria-hidden />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {sidebarOpen ? copy.sidebarClose : copy.sidebarOpen}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
