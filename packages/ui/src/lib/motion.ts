import type { Transition, Variants } from 'motion/react';

/**
 * Motion tokens — the single source of animation timing/easing in JS land.
 * The CSS counterparts live in `packages/ui/src/styles/theme.css`
 * (`--ease-*`, `--duration-*`); keep the two in sync. JS code must read from
 * here instead of writing inline cubic-bezier / magic durations.
 *
 * See docs/architecture/20-hareket-etkilesim-sistemi.md §20.9.
 */

/** Cubic-bezier easing curves. Framer expects mutable `[x1,y1,x2,y2]` tuples. */
export const easings: Record<
  'standard' | 'out' | 'in' | 'emphasized' | 'panelSlide',
  [number, number, number, number]
> = {
  standard: [0.4, 0, 0.2, 1],
  out: [0.16, 1, 0.3, 1],
  in: [0.4, 0, 1, 1],
  emphasized: [0.22, 1, 0.36, 1],
  // Trello-vari side-panel slide (width 0↔auto). app-shell sol global panelleri.
  panelSlide: [0.32, 0.72, 0, 1],
};

/** Durations in **seconds** (Framer unit), mirroring `--duration-*` (ms). */
export const durations = {
  instant: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.32,
  slower: 0.48,
} as const;

/**
 * Spring presets — real physics for snap / settle / layout reorder (§20.5).
 * snappy: small elements, press release, toggle thumb.
 * smooth: card snap, layout reorder, modal.
 * gentle: large panels, sidebar, page-level.
 */
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 };
export const springSmooth: Transition = { type: 'spring', stiffness: 300, damping: 30 };
export const springGentle: Transition = { type: 'spring', stiffness: 200, damping: 26 };

/** Standard entrance: opacity + slight upward translate (never fade-only — §20.4). */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.out } },
  exit: { opacity: 0, y: 4, transition: { duration: durations.fast, ease: easings.in } },
};

/** Reduced-motion entrance: opacity only, no transform. */
export const fadeInReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.fast } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};
