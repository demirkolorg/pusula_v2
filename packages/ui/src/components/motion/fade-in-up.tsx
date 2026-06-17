'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { fadeInReduced, fadeInUp } from '../../lib/motion';

export type FadeInUpProps = HTMLMotionProps<'div'>;

/**
 * Standard entrance — opacity + slight upward translate (never fade-only, §20.4).
 * `AnimatePresence`-friendly (exposes initial/animate/exit variants). Reduced
 * motion falls back to an opacity-only fade.
 *
 * See docs/architecture/20-hareket-etkilesim-sistemi.md §20.4.
 */
export function FadeInUp({ children, ...props }: FadeInUpProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={reduce ? fadeInReduced : fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
}
