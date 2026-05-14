import type { PaletteName } from './components/avatar';

export const BOARD_BACKGROUND_GRADIENTS = [
  'sunset',
  'ocean',
  'rainbow',
  'forest',
  'lavender',
  'sunrise',
  'midnight',
  'mint',
  'aurora',
  'coral',
] as const;

export type BoardBackgroundGradient = (typeof BOARD_BACKGROUND_GRADIENTS)[number];

export const BG_GRADIENT_CLASS: Record<BoardBackgroundGradient, string> = {
  sunset: 'bg-gradient-sunset',
  ocean: 'bg-gradient-ocean',
  rainbow: 'bg-gradient-rainbow',
  forest: 'bg-gradient-forest',
  lavender: 'bg-gradient-lavender',
  sunrise: 'bg-gradient-sunrise',
  midnight: 'bg-gradient-midnight',
  mint: 'bg-gradient-mint',
  aurora: 'bg-gradient-aurora',
  coral: 'bg-gradient-coral',
};

// Manual sync with @pusula/domain CARD_COVER_COLORS and theme.css --palet-* tokens.
export const BOARD_SOLID_BACKGROUND_CLASS: Record<PaletteName, string> = {
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

const gradientNames = new Set<string>(BOARD_BACKGROUND_GRADIENTS);
const solidNames = new Set<string>(Object.keys(BOARD_SOLID_BACKGROUND_CLASS));

export function boardBackgroundClass(background: string | null | undefined): string {
  if (background == null) return 'bg-background';

  const parts = background.split(':');
  if (parts.length !== 2) return 'bg-background';

  const [kind, name] = parts;
  if (kind === 'gradient' && name != null && gradientNames.has(name)) {
    return BG_GRADIENT_CLASS[name as BoardBackgroundGradient];
  }
  if (kind === 'solid' && name != null && solidNames.has(name)) {
    return BOARD_SOLID_BACKGROUND_CLASS[name as PaletteName];
  }

  return 'bg-background';
}
