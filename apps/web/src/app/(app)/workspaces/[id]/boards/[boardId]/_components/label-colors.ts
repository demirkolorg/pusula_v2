/**
 * Maps the fixed `@pusula/domain` `LABEL_COLORS` palette onto Pusula's design
 * tokens. The shared `theme.css` exposes a 12-colour `--palet-*` token set;
 * here we bind the domain's 10 colour tokens to their palette names so the web
 * app stays token-driven (no raw `bg-green-500` etc.).
 *
 * `LABEL_SWATCH[color]` keeps its existing `Record<LabelColor, string>` shape
 * (a `bg-palet-*` utility class) so current callers don't need changes. The
 * class names are written out as plain string literals so Tailwind's content
 * scanner picks them up.
 */
import type { LabelColor } from '@pusula/domain';
import type { PaletteName } from '@pusula/ui';

/** Domain label colour → design-token palette name. */
export const LABEL_PALETTE: Record<LabelColor, PaletteName> = {
  green: 'yesil',
  yellow: 'sari',
  orange: 'turuncu',
  red: 'kirmizi',
  purple: 'mor',
  blue: 'mavi',
  sky: 'sky',
  lime: 'lime',
  pink: 'pembe',
  black: 'siyah',
};

/**
 * Background swatch utility per domain label colour. Literal `bg-palet-*`
 * strings — keep them spelled out so Tailwind scans them.
 */
export const LABEL_SWATCH: Record<LabelColor, string> = {
  green: 'bg-palet-yesil',
  yellow: 'bg-palet-sari',
  orange: 'bg-palet-turuncu',
  red: 'bg-palet-kirmizi',
  purple: 'bg-palet-mor',
  blue: 'bg-palet-mavi',
  sky: 'bg-palet-sky',
  lime: 'bg-palet-lime',
  pink: 'bg-palet-pembe',
  black: 'bg-palet-siyah',
};
