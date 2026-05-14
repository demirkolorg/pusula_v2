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
  'lagoon',
  'ember',
  'blossom',
  'meadow',
  'dusk',
  'pearl',
] as const;

export type BoardBackgroundGradient = (typeof BOARD_BACKGROUND_GRADIENTS)[number];

export const BG_GRADIENT_CLASS: Record<BoardBackgroundGradient, string> = {
  sunset: 'board-bg-gradient-sunset',
  ocean: 'board-bg-gradient-ocean',
  rainbow: 'board-bg-gradient-rainbow',
  forest: 'board-bg-gradient-forest',
  lavender: 'board-bg-gradient-lavender',
  sunrise: 'board-bg-gradient-sunrise',
  midnight: 'board-bg-gradient-midnight',
  mint: 'board-bg-gradient-mint',
  aurora: 'board-bg-gradient-aurora',
  coral: 'board-bg-gradient-coral',
  lagoon: 'board-bg-gradient-lagoon',
  ember: 'board-bg-gradient-ember',
  blossom: 'board-bg-gradient-blossom',
  meadow: 'board-bg-gradient-meadow',
  dusk: 'board-bg-gradient-dusk',
  pearl: 'board-bg-gradient-pearl',
};

// Manual sync with @pusula/domain BOARD_BACKGROUND_SOLID_COLORS and theme.css tokens.
export const BOARD_BACKGROUND_SOLID_COLORS = [
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
  'beyaz',
  'kirik-beyaz',
  'fildisi',
  'buz-beyazi',
  'gumus',
] as const;

export type BoardBackgroundSolidColor = (typeof BOARD_BACKGROUND_SOLID_COLORS)[number];

export const BOARD_SOLID_BACKGROUND_CLASS: Record<BoardBackgroundSolidColor, string> = {
  kirmizi: 'board-bg-solid-kirmizi',
  turuncu: 'board-bg-solid-turuncu',
  sari: 'board-bg-solid-sari',
  lime: 'board-bg-solid-lime',
  yesil: 'board-bg-solid-yesil',
  sky: 'board-bg-solid-sky',
  mavi: 'board-bg-solid-mavi',
  indigo: 'board-bg-solid-indigo',
  mor: 'board-bg-solid-mor',
  pembe: 'board-bg-solid-pembe',
  gri: 'board-bg-solid-gri',
  siyah: 'board-bg-solid-siyah',
  beyaz: 'board-bg-solid-beyaz',
  'kirik-beyaz': 'board-bg-solid-kirik-beyaz',
  fildisi: 'board-bg-solid-fildisi',
  'buz-beyazi': 'board-bg-solid-buz-beyazi',
  gumus: 'board-bg-solid-gumus',
};

const gradientNames = new Set<string>(BOARD_BACKGROUND_GRADIENTS);
const solidNames = new Set<string>(BOARD_BACKGROUND_SOLID_COLORS);

export function boardBackgroundClass(background: string | null | undefined): string {
  if (background == null) return 'board-bg-default';

  const parts = background.split(':');
  if (parts.length !== 2) return 'board-bg-default';

  const [kind, name] = parts;
  if (kind === 'gradient' && name != null && gradientNames.has(name)) {
    return BG_GRADIENT_CLASS[name as BoardBackgroundGradient];
  }
  if (kind === 'solid' && name != null && solidNames.has(name)) {
    return BOARD_SOLID_BACKGROUND_CLASS[name as BoardBackgroundSolidColor];
  }

  return 'board-bg-default';
}
