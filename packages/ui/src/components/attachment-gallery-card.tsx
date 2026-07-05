'use client';

import * as React from 'react';
import {
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** Coarse file classification — mirrors `@pusula/domain` `AttachmentKind`. */
export type AttachmentGalleryKind = 'image' | 'pdf' | 'office';

export interface AttachmentGalleryCardLabels {
  preview: string;
  download: string;
  /** Accessible label for the overflow (`⋮`) menu trigger. */
  moreActions: string;
  makeCover: string;
  removeCover: string;
  delete: string;
  coverBadge: string;
}

export interface AttachmentGalleryCardProps {
  fileName: string;
  kind: AttachmentGalleryKind | null;
  mimeType: string;
  /** Presigned image URL for the thumbnail (image kind only). */
  thumbnailUrl?: string | null;
  isCover?: boolean;
  canDelete?: boolean;
  canSetCover?: boolean;
  /** Preview is offered for image + pdf only — caller decides. */
  canPreview?: boolean;
  onPreview?: () => void;
  onDownload?: () => void;
  onToggleCover?: () => void;
  onDelete?: () => void;
  labels: AttachmentGalleryCardLabels;
  className?: string;
}

/**
 * Thumbnail container background per office sub-type. Icon colours use the
 * 600/400 ramp so the glyph clears the WCAG 2.2 3:1 non-text-contrast bar
 * against the tinted `/10` background — mirrors `AttachmentTile`.
 */
function officeBg(mimeType: string): string {
  if (mimeType.includes('word')) {
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  }
  if (mimeType.includes('sheet') || mimeType.includes('excel')) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
  }
  return 'bg-muted text-muted-foreground';
}

/**
 * One attachment as a square gallery cell — a full-bleed image thumbnail (or a
 * tinted file-type icon for pdf/office), the file name in a bottom gradient
 * band, an optional "cover" badge, and a hover/focus action overlay
 * (preview / download / overflow menu). Read-only oriented: the overflow menu
 * offers cover toggling + deletion (each gated by its permission flag);
 * uploading + description editing live elsewhere (card header "+ Ekle"
 * popover). Entity-agnostic — all copy comes from
 * {@link AttachmentGalleryCardLabels}.
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.9.
 */
function AttachmentGalleryCard({
  fileName,
  kind,
  mimeType,
  thumbnailUrl,
  isCover = false,
  canDelete = false,
  canSetCover = false,
  canPreview = false,
  onPreview,
  onDownload,
  onToggleCover,
  onDelete,
  labels,
  className,
}: AttachmentGalleryCardProps) {
  const [imageFailed, setImageFailed] = React.useState(false);

  // Presigned thumbnail URLs are refreshed after their TTL (1 hour); when a new
  // URL arrives, clear a stale `imageFailed` so the valid image isn't stuck on
  // the icon fallback (mirrors AttachmentTile).
  React.useEffect(() => {
    setImageFailed(false);
  }, [thumbnailUrl]);

  const showMenu = canSetCover || canDelete;

  return (
    <div
      data-slot="attachment-gallery-card"
      className={cn(
        'group relative aspect-square overflow-hidden rounded-md border bg-card',
        className,
      )}
    >
      {/* Thumbnail / icon (fills the cell) --------------------------------- */}
      {kind === 'image' && thumbnailUrl && !imageFailed ? (
        <img
          src={thumbnailUrl}
          alt={fileName}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : kind === 'pdf' ? (
        <div className="flex size-full items-center justify-center bg-destructive/10">
          <FileTextIcon className="size-10 text-red-600 dark:text-red-400" aria-hidden />
        </div>
      ) : kind === 'office' ? (
        <div className={cn('flex size-full items-center justify-center', officeBg(mimeType))}>
          <FileTextIcon className="size-10" aria-hidden />
        </div>
      ) : kind === 'image' ? (
        // Image kind but no (or failed) thumbnail — an image glyph, not a file.
        <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
          <ImageIcon className="size-10" aria-hidden />
        </div>
      ) : (
        <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
          <FileIcon className="size-10" aria-hidden />
        </div>
      )}

      {/* Full-cell preview trigger — görsel/PDF hücresine tıklamayı da hover
          overlay'deki göz butonuyla aynı önizlemeye bağlar. Klavye erişimi o
          görünür buton üzerinden sağlandığı için bu katman `tabIndex={-1}`
          (yalnızca fare/dokunma hedefi). Aksiyon overlay'i + isim bandı DOM'da
          bundan sonra geldiği için üstte kalır ve tıklanabilirliğini korur. */}
      {canPreview && onPreview && (
        <button
          type="button"
          aria-label={labels.preview}
          tabIndex={-1}
          onClick={onPreview}
          className="absolute inset-0 cursor-zoom-in"
        />
      )}

      {/* Cover badge ------------------------------------------------------- */}
      {isCover && (
        <span className="pointer-events-none absolute top-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
          {labels.coverBadge}
        </span>
      )}

      {/* File name band (always visible; gradient keeps it legible over both
          image thumbnails and light icon backgrounds). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 pt-6 pb-1.5">
        <p className="truncate text-[11px] font-medium text-white" title={fileName}>
          {fileName}
        </p>
      </div>

      {/* Action overlay (hover / focus) ------------------------------------ */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canPreview && onPreview && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.preview}
                className="size-7 bg-background/80 backdrop-blur hover:bg-background"
                onClick={onPreview}
              >
                <EyeIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{labels.preview}</TooltipContent>
          </Tooltip>
        )}
        {onDownload && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.download}
                className="size-7 bg-background/80 backdrop-blur hover:bg-background"
                onClick={onDownload}
              >
                <DownloadIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{labels.download}</TooltipContent>
          </Tooltip>
        )}
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.moreActions}
                className="size-7 bg-background/80 backdrop-blur hover:bg-background"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSetCover && onToggleCover && (
                <DropdownMenuItem onSelect={onToggleCover}>
                  <ImageIcon className="size-4" aria-hidden />
                  {isCover ? labels.removeCover : labels.makeCover}
                </DropdownMenuItem>
              )}
              {canSetCover && onToggleCover && canDelete && onDelete && (
                <DropdownMenuSeparator />
              )}
              {canDelete && onDelete && (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2Icon className="size-4" aria-hidden />
                  {labels.delete}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

export { AttachmentGalleryCard };
