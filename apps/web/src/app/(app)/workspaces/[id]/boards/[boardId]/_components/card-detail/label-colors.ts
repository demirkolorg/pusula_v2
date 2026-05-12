/**
 * Tailwind swatch classes for the fixed `@pusula/domain` `LABEL_COLORS`
 * palette. Clients hardcode the swatch per token (per the domain doc) — this is
 * the web app's mapping. Kept as plain strings so Tailwind's content scanner
 * picks them up.
 */
import type { LabelColor } from '@pusula/domain';

export const LABEL_SWATCH: Record<LabelColor, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-400',
  lime: 'bg-lime-500',
  pink: 'bg-pink-500',
  black: 'bg-neutral-800',
};
