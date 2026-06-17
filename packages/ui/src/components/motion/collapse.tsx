'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { durations, easings } from '../../lib/motion';

export interface CollapseProps {
  /** When true the content is expanded (animated to its natural height). */
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Animated expand/collapse via Framer `height: auto` — the sanctioned
 * alternative to the banned `max-height` transition (§20.7). Content unmounts
 * when closed. Reduced motion collapses instantly.
 *
 * See docs/architecture/20-hareket-etkilesim-sistemi.md §20.7.
 */
export function Collapse({ open, children, className }: CollapseProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={
            reduce
              ? { duration: durations.fast }
              : { duration: durations.base, ease: easings.standard }
          }
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
