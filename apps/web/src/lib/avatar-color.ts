import type { PaletteName } from '@pusula/ui';

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

const PALETTE_SOLID_CLASS: Record<PaletteName, string> = {
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

const PALETTE_SWATCH_CLASS: Record<PaletteName, string> = {
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

function hashIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

export function avatarInitials(value: string | null | undefined): string {
  const parts = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function avatarPaletteName(value: string | null | undefined): PaletteName {
  const key = value?.trim() || 'pusula';
  return PALETTE_NAMES[hashIndex(key, PALETTE_NAMES.length)]!;
}

export function avatarPaletteSolidClass(value: string | null | undefined): string {
  return PALETTE_SOLID_CLASS[avatarPaletteName(value)];
}

export function avatarPaletteSwatchClass(value: string | null | undefined): string {
  return PALETTE_SWATCH_CLASS[avatarPaletteName(value)];
}
