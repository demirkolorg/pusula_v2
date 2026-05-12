'use client';

import { CARD_COVER_COLORS, type CardCoverColor } from '@pusula/domain';
import { Alert, AlertDescription, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type CardDetailCoverColorProps = {
  /** The card's current cover colour (`null` ⇒ none). */
  coverColor: CardCoverColor | null;
  /** Whether the viewer may change the cover colour (board `member+`, board/list/card active). */
  canEdit: boolean;
  /** Called with the chosen palette name, or `null` to clear the cover colour. Only invoked on a real change. */
  onSelect: (next: CardCoverColor | null) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Per-palette swatch background utility. Literal `bg-palet-*` strings — spelled
 * out so Tailwind's content scanner picks all 12 up (no dynamic concat).
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
 * Inline cover-colour picker for the card modal — a 12-swatch grid (the
 * `CARD_COVER_COLORS` palette) plus a "remove" button. Mirrors the label-colour
 * picker's pattern (inline bordered section, not a `Popover` — avoids pulling in
 * another primitive). Presentational; the dialog wires the `card.update` mutation.
 */
export function CardDetailCoverColor({
  coverColor,
  canEdit,
  onSelect,
  pending = false,
  error,
}: CardDetailCoverColorProps) {
  const copy = strings.card.detail.modal;

  return (
    <section className="space-y-3 rounded-md border p-3">
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
