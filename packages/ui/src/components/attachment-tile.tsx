'use client';

import * as React from 'react';
import {
  DownloadIcon,
  Edit3Icon,
  EyeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Textarea } from './textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** Coarse file classification — mirrors `@pusula/domain` `AttachmentKind`. */
export type AttachmentTileKind = 'image' | 'pdf' | 'office';

export interface AttachmentTileLabels {
  preview: string;
  download: string;
  editDescription: string;
  /** Accessible label for the overflow (`⋮`) menu trigger. */
  moreActions: string;
  makeCover: string;
  removeCover: string;
  delete: string;
  coverBadge: string;
  /** Inline-edit textarea placeholder. */
  descriptionPlaceholder: string;
  editSave: string;
  editCancel: string;
  /** Receives `(used, max)` — character counter for the edit textarea. */
  descriptionCounter: (used: number, max: number) => string;
}

export interface AttachmentTileProps {
  fileName: string;
  kind: AttachmentTileKind | null;
  mimeType: string;
  /** Pre-formatted file size, e.g. "1,2 MB". */
  sizeLabel: string;
  /** Uploader display name (already resolved). */
  uploaderName: string;
  /** Pre-formatted relative time, e.g. "3 saat önce". */
  timeLabel: string;
  description: string | null;
  /** Presigned image URL for the thumbnail (image kind only). */
  thumbnailUrl?: string | null;
  isCover?: boolean;
  /** Description-edit textarea max length. */
  descriptionMaxLength: number;
  canEdit?: boolean;
  canDelete?: boolean;
  canSetCover?: boolean;
  /** Preview is offered for image + pdf only — caller decides. */
  canPreview?: boolean;
  onPreview?: () => void;
  onDownload?: () => void;
  onSaveDescription?: (description: string) => void;
  onToggleCover?: () => void;
  onDelete?: () => void;
  labels: AttachmentTileLabels;
  className?: string;
}

/**
 * Thumbnail container background per office sub-type. Icon colours are
 * deliberately the 600/400 ramp so the icon clears the WCAG 2.2 3:1
 * non-text-contrast bar against the tinted `/10` background.
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
 * One attachment row — 56×56 thumbnail/icon, file metadata, hover action
 * cluster (preview / download / overflow menu). The overflow menu offers
 * description editing, cover toggling and deletion, each gated by the matching
 * permission flag. Inline description editing swaps the metadata block for a
 * textarea + save/cancel.
 *
 * Entity-agnostic — all copy comes from {@link AttachmentTileLabels}.
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.3.
 */
function AttachmentTile({
  fileName,
  kind,
  mimeType,
  sizeLabel,
  uploaderName,
  timeLabel,
  description,
  thumbnailUrl,
  isCover = false,
  descriptionMaxLength,
  canEdit = false,
  canDelete = false,
  canSetCover = false,
  canPreview = false,
  onPreview,
  onDownload,
  onSaveDescription,
  onToggleCover,
  onDelete,
  labels,
  className,
}: AttachmentTileProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(description ?? '');
  const [imageFailed, setImageFailed] = React.useState(false);

  // Presigned thumbnail URL'leri TTL (1 saat) sonrası yenilenir; yeni URL
  // geldiğinde eski (süresi dolmuş) URL'in tetiklediği `imageFailed` takılı
  // kalmasın — aksi halde geçerli görsel kalıcı olarak ikon fallback'te kalırdı.
  React.useEffect(() => {
    setImageFailed(false);
  }, [thumbnailUrl]);

  const startEdit = () => {
    setDraft(description ?? '');
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(description ?? '');
  };
  const saveEdit = () => {
    onSaveDescription?.(draft.trim());
    setEditing(false);
  };

  const overLimit = draft.length > descriptionMaxLength;

  return (
    <div
      data-slot="attachment-tile"
      className={cn(
        'group flex items-start gap-2.5 rounded-md border bg-card p-2 transition-colors hover:bg-muted/40',
        className,
      )}
    >
      {/* Thumbnail / icon -------------------------------------------------- */}
      <div className="size-14 shrink-0 overflow-hidden rounded-md">
        {kind === 'image' && thumbnailUrl && !imageFailed ? (
          <img
            src={thumbnailUrl}
            alt={fileName}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : kind === 'pdf' ? (
          // `text-red-600/400` (not `text-destructive`) so the icon clears the
          // WCAG 2.2 3:1 non-text-contrast bar against the `/10` tint.
          <div className="flex size-full items-center justify-center bg-destructive/10">
            <FileTextIcon className="size-7 text-red-600 dark:text-red-400" aria-hidden />
          </div>
        ) : kind === 'office' ? (
          <div className={cn('flex size-full items-center justify-center', officeBg(mimeType))}>
            <FileTextIcon className="size-7" aria-hidden />
          </div>
        ) : (
          // Unknown / null kind — a generic file icon, not the misleading image
          // glyph.
          <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
            <FileIcon className="size-7" aria-hidden />
          </div>
        )}
      </div>

      {/* Metadata / inline edit ------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={fileName}>
            {fileName}
          </span>
          {isCover && (
            // Solid primary fill so the small-text label clears WCAG 4.5:1.
            <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {labels.coverBadge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span>{sizeLabel}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{uploaderName}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{timeLabel}</span>
        </div>

        {editing ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <Textarea
              rows={2}
              value={draft}
              autoFocus
              aria-label={labels.editDescription}
              aria-invalid={overLimit}
              placeholder={labels.descriptionPlaceholder}
              maxLength={descriptionMaxLength}
              onChange={(event) => setDraft(event.target.value)}
              className="text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <span
                aria-live="polite"
                className={cn(
                  'text-[10px] text-muted-foreground',
                  overLimit && 'text-destructive',
                )}
              >
                {labels.descriptionCounter(draft.length, descriptionMaxLength)}
              </span>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                  {labels.editCancel}
                </Button>
                <Button type="button" size="sm" onClick={saveEdit} disabled={overLimit}>
                  {labels.editSave}
                </Button>
              </div>
            </div>
          </div>
        ) : description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground italic">{description}</p>
        ) : null}
      </div>

      {/* Action cluster --------------------------------------------------- */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canPreview && onPreview && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.preview}
                  className="size-7"
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
                  className="size-7"
                  onClick={onDownload}
                >
                  <DownloadIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{labels.download}</TooltipContent>
            </Tooltip>
          )}
          {(canEdit || canDelete || canSetCover) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.moreActions}
                  className="size-7"
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && onSaveDescription && (
                  <DropdownMenuItem onSelect={startEdit}>
                    <Edit3Icon className="size-4" />
                    {labels.editDescription}
                  </DropdownMenuItem>
                )}
                {canSetCover && kind === 'image' && onToggleCover && (
                  <DropdownMenuItem onSelect={onToggleCover}>
                    <ImageIcon className="size-4" />
                    {isCover ? labels.removeCover : labels.makeCover}
                  </DropdownMenuItem>
                )}
                {canDelete && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                      <Trash2Icon className="size-4" />
                      {labels.delete}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

export { AttachmentTile };
