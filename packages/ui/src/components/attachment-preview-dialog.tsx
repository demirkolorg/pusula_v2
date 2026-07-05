'use client';

import * as React from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** Preview-capable kinds — office files are downloaded, never previewed. */
export type AttachmentPreviewKind = 'image' | 'pdf';

export interface AttachmentPreviewLabels {
  download: string;
  /** Action that opens the file in a new browser tab. */
  openInNewTab: string;
  close: string;
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  /** Accessible label for the scrollable preview area (keyboard scroll). */
  zoomArea: string;
  /** Shown while the presigned URL is still loading. */
  loading: string;
  /** Shown when the URL could not be resolved *or* the image fails to load. */
  error: string;
  /** Accessible label for the "previous previewable attachment" control. */
  prev: string;
  /** Accessible label for the "next previewable attachment" control. */
  next: string;
}

export interface AttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  kind: AttachmentPreviewKind;
  /** Presigned GET URL — `null` while loading, `undefined` on error. */
  url: string | null | undefined;
  /** True while the presigned URL request is in flight. */
  loadingUrl?: boolean;
  onDownload?: () => void;
  /** Navigate to the previous/next previewable attachment (image/pdf). */
  onPrev?: () => void;
  onNext?: () => void;
  /** Whether a previous/next previewable attachment exists (drives disabled state). */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** 1-based position within the previewable set, for the "n / total" indicator. */
  position?: { index: number; total: number };
  labels: AttachmentPreviewLabels;
}

/** Discrete zoom steps for image preview. */
const ZOOM_STEPS = [100, 150, 200] as const;

/**
 * Full-screen-ish attachment preview. Images render with discrete zoom
 * controls; PDFs render inside a sandboxed `<iframe>`. The presigned URL is
 * supplied lazily by the caller (it expires, so it is fetched on open and
 * cleared on close).
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.4.
 */
function AttachmentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  kind,
  url,
  loadingUrl = false,
  onDownload,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
  labels,
}: AttachmentPreviewDialogProps) {
  const [zoomIndex, setZoomIndex] = React.useState(0);
  const [imageFailed, setImageFailed] = React.useState(false);

  // Reset zoom + image-error whenever the dialog opens or the file changes.
  React.useEffect(() => {
    if (open) {
      setZoomIndex(0);
      setImageFailed(false);
    }
  }, [open, fileName]);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 100;

  // Sol/sağ ok tuşları önizlenebilir ekler arası gezinir; yukarı/aşağı zoom
  // alanının kendi scroll'unda kalır. preventDefault → yatay scroll ile çakışmaz.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' && hasPrev && onPrev) {
      event.preventDefault();
      onPrev();
    } else if (event.key === 'ArrowRight' && hasNext && onNext) {
      event.preventDefault();
      onNext();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-label={fileName}
        onKeyDown={handleKeyDown}
        className="flex h-[85vh] w-[min(1100px,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="min-w-0 truncate text-sm font-medium">{fileName}</DialogTitle>
            {position && position.total > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {position.index} / {position.total}
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">{fileName}</DialogDescription>
          <div className="flex shrink-0 items-center gap-1">
            {kind === 'image' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.zoomOut}
                      disabled={zoomIndex === 0}
                      onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
                    >
                      <MinusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{labels.zoomOut}</TooltipContent>
                </Tooltip>
                <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
                  {zoom}%
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.zoomIn}
                      disabled={zoomIndex === ZOOM_STEPS.length - 1}
                      onClick={() =>
                        setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))
                      }
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{labels.zoomIn}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.zoomReset}
                      disabled={zoomIndex === 0}
                      onClick={() => setZoomIndex(0)}
                    >
                      <RotateCcwIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{labels.zoomReset}</TooltipContent>
                </Tooltip>
              </>
            )}
            {url && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={labels.openInNewTab}
                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLinkIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{labels.openInNewTab}</TooltipContent>
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
                    onClick={onDownload}
                  >
                    <DownloadIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{labels.download}</TooltipContent>
              </Tooltip>
            )}
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                {labels.close}
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="relative flex flex-1 overflow-hidden">
          {onPrev && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={labels.prev}
                  disabled={!hasPrev}
                  onClick={onPrev}
                  className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full shadow-md"
                >
                  <ChevronLeftIcon className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{labels.prev}</TooltipContent>
            </Tooltip>
          )}
          <div
            tabIndex={0}
            role="group"
            aria-label={labels.zoomArea}
            className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
          >
            {loadingUrl ? (
              <p className="text-sm text-muted-foreground">{labels.loading}</p>
            ) : !url || imageFailed ? (
              <p className="text-sm text-destructive">{labels.error}</p>
            ) : kind === 'image' ? (
              <img
                src={url}
                alt={fileName}
                onError={() => setImageFailed(true)}
                className={cn('max-h-full max-w-full object-contain transition-transform')}
                style={{ transform: `scale(${zoom / 100})` }}
              />
            ) : (
              // PDF: rendered by the browser's built-in viewer. No `sandbox`
              // attribute — a sandboxed iframe blocks the PDF plugin, which
              // surfaces as a broken-file placeholder. The presigned GET URL is
              // read-only S3 content, so an unsandboxed iframe is safe here.
              <iframe src={url} title={fileName} className="size-full border-0" />
            )}
          </div>
          {onNext && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={labels.next}
                  disabled={!hasNext}
                  onClick={onNext}
                  className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full shadow-md"
                >
                  <ChevronRightIcon className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{labels.next}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AttachmentPreviewDialog };
