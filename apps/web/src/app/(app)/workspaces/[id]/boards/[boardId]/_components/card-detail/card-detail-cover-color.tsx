'use client';

import { ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import {
  CARD_COVER_COLORS,
  CARD_COVER_IMAGE_MIME_TYPES,
  type CardCoverColor,
} from '@pusula/domain';
import { Alert, AlertDescription, Button, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type CardDetailCoverColorProps = {
  /** The card's current cover colour (`null` => none). */
  coverColor: CardCoverColor | null;
  /** The card's current cover image metadata (`null` => no photo cover). */
  coverImage?: CoverImage | null;
  /** Whether the viewer may change card cover settings. */
  canEdit: boolean;
  /** Called with the chosen palette name, or `null` to clear the cover colour. */
  onSelect: (next: CardCoverColor | null) => void;
  onImageSelect?: (file: File) => void | Promise<void>;
  onClearImage?: () => void | Promise<void>;
  pending?: boolean;
  imagePending?: boolean;
  error?: string | null;
};

/**
 * Per-palette swatch background utility. Literal `bg-palet-*` strings are
 * spelled out so Tailwind's content scanner picks all 12 up.
 */
const SWATCH_BG: Record<CardCoverColor, string> = {
  kirmizi: 'bg-palet-kirmizi',
  turuncu: 'bg-palet-turuncu',
  sari: 'bg-palet-sari',
  lime: 'bg-palet-lime',
  yesil: 'bg-palet-yesil',
  sky: 'bg-palet-sky',
  mavi: 'bg-palet-mavi',
  indigo: 'bg-palet-indigo',
  mor: 'bg-palet-mor',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
  siyah: 'bg-palet-siyah',
};

export function CardDetailCoverColor({
  coverColor,
  coverImage = null,
  canEdit,
  onSelect,
  onImageSelect,
  onClearImage,
  pending = false,
  imagePending = false,
  error,
}: CardDetailCoverColorProps) {
  const copy = strings.card.detail.modal;
  const imageControlsDisabled = !canEdit || pending || imagePending;

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium">{copy.coverImageCurrent}</p>
        {coverImage ? (
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate text-xs">{coverImage.fileName}</span>
            </div>
            {canEdit && onClearImage && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={copy.coverImageClear}
                disabled={imageControlsDisabled}
                onClick={() => void onClearImage()}
                className="size-7 shrink-0"
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
        ) : null}
        {canEdit && onImageSelect && (
          <label
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-medium',
              'hover:bg-muted focus-within:ring-2 focus-within:ring-ring/60',
              imageControlsDisabled && 'pointer-events-none opacity-50',
            )}
          >
            <UploadIcon className="size-4" aria-hidden />
            {copy.coverImageUpload}
            <input
              type="file"
              aria-label={copy.coverImageUpload}
              accept={CARD_COVER_IMAGE_MIME_TYPES.join(',')}
              disabled={imageControlsDisabled}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void onImageSelect(file);
              }}
            />
          </label>
        )}
      </div>

      <p className="text-muted-foreground text-xs font-medium">{copy.coverColorPickerTitle}</p>
      <div className="flex flex-wrap gap-1.5">
        {CARD_COVER_COLORS.map((name) => {
          const on = coverColor === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                if (!on) onSelect(name);
              }}
              aria-label={`${copy.coverColorOf} ${name}`}
              aria-pressed={on}
              disabled={!canEdit || pending}
              className={cn(
                'size-5 rounded-full outline-none ring-offset-1 disabled:opacity-50',
                'focus-visible:ring-2 focus-visible:ring-ring/60',
                SWATCH_BG[name],
                on && 'ring-2 ring-foreground',
              )}
            />
          );
        })}
      </div>
      {coverColor != null && canEdit && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        >
          {copy.coverColorClear}
        </button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
