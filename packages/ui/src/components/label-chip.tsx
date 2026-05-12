import * as React from 'react';
import { cn } from '../lib/utils';
import type { PaletteName } from './avatar';

export type { PaletteName };

type LabelVariant = 'solid' | 'soft';

/**
 * Per-palette class lookup. Every `bg-palet-*` / `text-palet-*` utility is
 * written out as a literal here so Tailwind's content scanner sees all 12
 * colours × variants (no dynamic string concat).
 */
const PALETTE_STYLE: Record<
  PaletteName,
  { solid: string; soft: string; swatch: string; bar: string }
> = {
  kirmizi: {
    solid: 'bg-palet-kirmizi text-palet-kirmizi-foreground',
    soft: 'bg-palet-kirmizi/15 text-palet-kirmizi',
    swatch: 'bg-palet-kirmizi',
    bar: 'bg-palet-kirmizi',
  },
  turuncu: {
    solid: 'bg-palet-turuncu text-palet-turuncu-foreground',
    soft: 'bg-palet-turuncu/15 text-palet-turuncu',
    swatch: 'bg-palet-turuncu',
    bar: 'bg-palet-turuncu',
  },
  sari: {
    solid: 'bg-palet-sari text-palet-sari-foreground',
    soft: 'bg-palet-sari/15 text-palet-sari',
    swatch: 'bg-palet-sari',
    bar: 'bg-palet-sari',
  },
  lime: {
    solid: 'bg-palet-lime text-palet-lime-foreground',
    soft: 'bg-palet-lime/15 text-palet-lime',
    swatch: 'bg-palet-lime',
    bar: 'bg-palet-lime',
  },
  yesil: {
    solid: 'bg-palet-yesil text-palet-yesil-foreground',
    soft: 'bg-palet-yesil/15 text-palet-yesil',
    swatch: 'bg-palet-yesil',
    bar: 'bg-palet-yesil',
  },
  sky: {
    solid: 'bg-palet-sky text-palet-sky-foreground',
    soft: 'bg-palet-sky/15 text-palet-sky',
    swatch: 'bg-palet-sky',
    bar: 'bg-palet-sky',
  },
  mavi: {
    solid: 'bg-palet-mavi text-palet-mavi-foreground',
    soft: 'bg-palet-mavi/15 text-palet-mavi',
    swatch: 'bg-palet-mavi',
    bar: 'bg-palet-mavi',
  },
  indigo: {
    solid: 'bg-palet-indigo text-palet-indigo-foreground',
    soft: 'bg-palet-indigo/15 text-palet-indigo',
    swatch: 'bg-palet-indigo',
    bar: 'bg-palet-indigo',
  },
  mor: {
    solid: 'bg-palet-mor text-palet-mor-foreground',
    soft: 'bg-palet-mor/15 text-palet-mor',
    swatch: 'bg-palet-mor',
    bar: 'bg-palet-mor',
  },
  pembe: {
    solid: 'bg-palet-pembe text-palet-pembe-foreground',
    soft: 'bg-palet-pembe/15 text-palet-pembe',
    swatch: 'bg-palet-pembe',
    bar: 'bg-palet-pembe',
  },
  gri: {
    solid: 'bg-palet-gri text-palet-gri-foreground',
    soft: 'bg-palet-gri/15 text-palet-gri',
    swatch: 'bg-palet-gri',
    bar: 'bg-palet-gri',
  },
  siyah: {
    solid: 'bg-palet-siyah text-palet-siyah-foreground',
    soft: 'bg-palet-siyah/15 text-palet-siyah',
    swatch: 'bg-palet-siyah',
    bar: 'bg-palet-siyah',
  },
};

export interface LabelChipProps extends Omit<React.ComponentProps<'span'>, 'color' | 'children'> {
  color: PaletteName;
  name?: string | null;
  /** `solid` = filled chip; `soft` = tinted/soft chip. */
  variant?: LabelVariant;
}

/**
 * A board/card label chip. When `name` is empty it renders a short coloured bar
 * (Trello-style). Colours come from `theme.css` `--palet-*` tokens — no inline
 * hex.
 */
function LabelChip({ color, name, variant = 'solid', className, ...props }: LabelChipProps) {
  const style = PALETTE_STYLE[color];
  const trimmed = name?.trim() ?? '';

  if (trimmed.length === 0) {
    return (
      <span
        data-slot="label-chip"
        aria-hidden
        className={cn('inline-block h-2 w-8 rounded-sm', style.bar, className)}
        {...props}
      />
    );
  }

  return (
    <span
      data-slot="label-chip"
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium',
        variant === 'solid' ? style.solid : style.soft,
        className,
      )}
      {...props}
    >
      {trimmed}
    </span>
  );
}

export interface LabelSwatchProps extends Omit<React.ComponentProps<'span'>, 'color'> {
  color: PaletteName;
}

/** A small round colour dot for label colour pickers. */
function LabelSwatch({ color, className, ...props }: LabelSwatchProps) {
  return (
    <span
      data-slot="label-swatch"
      aria-hidden
      className={cn('inline-block size-2.5 rounded-full', PALETTE_STYLE[color].swatch, className)}
      {...props}
    />
  );
}

export { LabelChip, LabelSwatch };
