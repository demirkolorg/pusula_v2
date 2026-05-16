'use client';

import { CheckIcon, ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import {
  CARD_COVER_COLORS,
  CARD_COVER_IMAGE_MIME_TYPES,
  type CardCoverColor,
} from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/** A committed image attachment, surfaced as a cover-image candidate. */
export type CoverImageOption = {
  id: string;
  fileName: string;
  isCover: boolean;
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
  /** Image attachments on the card — selectable as the cover (Faz 11D). */
  imageAttachments?: CoverImageOption[];
  /** Pick an existing image attachment as the cover. */
  onCoverImageSelect?: (attachmentId: string) => void;
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

/**
 * Cover picker — a two-tab control (colour palette / cover image). The colour
 * tab carries the 12-swatch palette + clear; the image tab uploads a new file
 * **or** picks an existing image attachment as the cover (Faz 11D — DEM-150).
 */
export function CardDetailCoverColor({
  coverColor,
  coverImage = null,
  canEdit,
  onSelect,
  onImageSelect,
  onClearImage,
  imageAttachments = [],
  onCoverImageSelect,
  pending = false,
  imagePending = false,
  error,
}: CardDetailCoverColorProps) {
  const copy = strings.card.detail.modal;
  const attachmentCopy = strings.attachment;
  const imageControlsDisabled = !canEdit || pending || imagePending;

  return (
    <section className="space-y-3 rounded-md border p-3">
      <Tabs defaultValue="color">
        <TabsList>
          <TabsTrigger value="color" className="px-2 py-[3px] text-[11.5px]">
            {attachmentCopy.cover.tabColor}
          </TabsTrigger>
          <TabsTrigger value="image" className="px-2 py-[3px] text-[11.5px]">
            {attachmentCopy.cover.tabImage}
          </TabsTrigger>
        </TabsList>

        {/* Colour palette tab -------------------------------------------- */}
        <TabsContent value="color" className="space-y-2 pt-2">
          <p className="text-muted-foreground text-xs font-medium">
            {copy.coverColorPickerTitle}
          </p>
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
        </TabsContent>

        {/* Cover image tab ----------------------------------------------- */}
        <TabsContent value="image" className="space-y-2 pt-2">
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

          {imageAttachments.length > 0 && onCoverImageSelect && (
            <div className="flex flex-col gap-1">
              {imageAttachments.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  disabled={imageControlsDisabled}
                  onClick={() => onCoverImageSelect(image.id)}
                  aria-label={`${attachmentCopy.cover.selectAria} ${image.fileName}`}
                  aria-pressed={image.isCover}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition-colors',
                    'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                    image.isCover && 'border-primary',
                  )}
                >
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs">{image.fileName}</span>
                  {image.isCover && (
                    <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          )}
          {imageAttachments.length === 0 && (
            <p className="text-muted-foreground text-xs">{attachmentCopy.cover.imageEmpty}</p>
          )}

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
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
