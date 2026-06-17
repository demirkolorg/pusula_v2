'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { durations, easings } from '../../lib/motion';

export interface PressableProps extends HTMLMotionProps<'button'> {
  /** Scale applied while pressed. Default 0.97. */
  pressScale?: number;
}

/**
 * Standard "press feedback" wrapper — a `<button>` that dips slightly on tap.
 * Use for clickable surfaces where a CSS `active:scale-*` isn't enough (e.g.
 * a Framer-controlled element). Reduced-motion drops the scale entirely.
 *
 * See docs/architecture/20-hareket-etkilesim-sistemi.md §20.6.
 */
export function Pressable({ pressScale = 0.97, type = 'button', ...props }: PressableProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type={type}
      whileTap={reduce ? undefined : { scale: pressScale }}
      transition={{ duration: durations.instant, ease: easings.standard }}
      {...props}
    />
  );
}
