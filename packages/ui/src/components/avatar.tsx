import * as React from 'react';
import { cn } from '../lib/utils';

/** The 12 palette names exposed by `theme.css` (`--palet-*`). */
export type PaletteName =
  | 'kirmizi'
  | 'turuncu'
  | 'sari'
  | 'lime'
  | 'yesil'
  | 'sky'
  | 'mavi'
  | 'indigo'
  | 'mor'
  | 'pembe'
  | 'gri'
  | 'siyah';

const PALETTE_NAMES: readonly PaletteName[] = [
  'kirmizi',
  'turuncu',
  'sari',
  'lime',
  'yesil',
  'sky',
  'mavi',
  'indigo',
  'mor',
  'pembe',
  'gri',
  'siyah',
];

/**
 * Background utility per palette name. Literal `bg-palet-* text-palet-*-foreground`
 * pairs so Tailwind's scanner picks every variant up.
 */
const PALETTE_BG: Record<PaletteName, string> = {
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

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'size-4 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

export interface AvatarProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  name?: string | null;
  image?: string | null;
  size?: AvatarSize;
  /** Adds a ring matching the surrounding surface (useful in stacks). */
  ring?: boolean;
}

/** Deterministic small hash of a string → 0..n-1. */
function hashIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

/** Up to two uppercase initials from a (possibly multi-word) name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function paletteFor(name: string): PaletteName {
  return PALETTE_NAMES[hashIndex(name, PALETTE_NAMES.length)]!;
}

/**
 * Compact user avatar — image when available, otherwise deterministic initials
 * on a palette-coloured background. Not Radix-based by design (no async image
 * fallback orchestration needed for our use).
 */
function Avatar({ name, image, size = 'md', ring = false, className, ...props }: AvatarProps) {
  const trimmedName = name?.trim() ?? '';
  const hasName = trimmedName.length > 0;
  const initials = hasName ? initialsOf(trimmedName) : '';
  const colorClass = hasName
    ? PALETTE_BG[paletteFor(trimmedName)]
    : 'bg-muted text-muted-foreground';

  return (
    <span
      data-slot="avatar"
      aria-label={hasName ? trimmedName : undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium',
        SIZE_CLASS[size],
        ring && 'ring-2 ring-card',
        image ? 'bg-muted' : colorClass,
        className,
      )}
      {...props}
    >
      {image ? (
        <img src={image} alt={hasName ? trimmedName : ''} className="size-full object-cover" />
      ) : (
        <span aria-hidden={!hasName}>{initials}</span>
      )}
    </span>
  );
}

export { Avatar };
