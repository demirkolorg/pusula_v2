'use client';

import * as React from 'react';
import { Loader2Icon, PlusIcon, UploadCloudIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Progress } from './progress';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface DropzoneLabels {
  /** Idle headline, e.g. "Dosya bırak veya seç". */
  idle: string;
  /** Idle hint line, e.g. accepted types + max size. */
  hint: string;
  /** Drag-over headline, e.g. "Bırak yüklesin". */
  active: string;
  /** Uploading headline — receives the integer percentage. */
  uploading: (percent: number) => string;
  /** Accessible label for the file-picker button. */
  ariaLabel: string;
  /** Tooltip shown when disabled (viewer). */
  disabledHint: string;
}

export interface DropzoneProps {
  /** `accept` attribute for the native file input (MIME list joined with `,`). */
  accept: string;
  /** Maximum byte size — passed through for the caller's reject logic; not enforced here. */
  maxBytes: number;
  disabled?: boolean;
  uploading?: boolean;
  /** Upload progress 0–100; only meaningful while `uploading`. */
  progress?: number;
  /** Called with the first picked / dropped file. */
  onFile: (file: File) => void;
  labels: DropzoneLabels;
  className?: string;
}

/**
 * File upload drop area — drag-drop + click-to-pick + keyboard activate.
 * A hidden native `<input type="file">` does the actual file selection; the
 * surrounding element is a `role="button"` so keyboard users can trigger it
 * with Enter / Space. State surfaces: idle, drag-over, uploading, disabled.
 *
 * Entity-agnostic — all copy comes from {@link DropzoneLabels}. `maxBytes` is
 * not enforced here (the caller rejects oversized files so it can show a
 * localized toast); it is accepted for documentation / future use.
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.1.
 */
function Dropzone({
  accept,
  maxBytes: _maxBytes,
  disabled = false,
  uploading = false,
  progress = 0,
  onFile,
  labels,
  className,
}: DropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const interactive = !disabled && !uploading;

  const openPicker = React.useCallback(() => {
    if (interactive) inputRef.current?.click();
  }, [interactive]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (!interactive) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const pct = Math.min(Math.max(Math.round(progress), 0), 100);

  const surface = (
    <div
      role="button"
      // Keep the surface focusable even when disabled so keyboard users can
      // reach the explanatory tooltip (activation is blocked by `interactive`).
      tabIndex={0}
      aria-label={labels.ariaLabel}
      aria-disabled={disabled || undefined}
      data-slot="dropzone"
      data-state={uploading ? 'uploading' : dragOver ? 'drag-over' : 'idle'}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        event.preventDefault();
        if (interactive) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center outline-none transition-colors',
        interactive && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/60',
        dragOver && interactive && 'border-primary/60 bg-primary/5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {uploading ? (
        <>
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium" aria-live="polite">
            {labels.uploading(pct)}
          </p>
          <Progress
            value={pct}
            className="mt-1 w-full max-w-48"
            aria-label={labels.uploading(pct)}
          />
        </>
      ) : dragOver && interactive ? (
        <>
          <PlusIcon className="size-8 text-primary" aria-hidden />
          <p className="text-sm font-medium text-primary">{labels.active}</p>
        </>
      ) : (
        <>
          <UploadCloudIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{labels.idle}</p>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={!interactive}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{surface}</TooltipTrigger>
        <TooltipContent>{labels.disabledHint}</TooltipContent>
      </Tooltip>
    );
  }

  return surface;
}

export { Dropzone };
