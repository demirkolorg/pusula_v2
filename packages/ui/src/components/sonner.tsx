'use client';

import { Toaster as SonnerToaster, toast as sonnerToast, type ToasterProps } from 'sonner';

/**
 * App-wide toast container. Drop this once at the root of the layout — the
 * `toast()` helper from `sonner` works from anywhere (including non-React
 * call sites) once the toaster is mounted.
 *
 * Default behaviour: top-right, rich colors (so `destructive` looks
 * destructive), 5s auto-dismiss, with a close button so a user can dismiss
 * before the timer runs out. Variants the app uses (Phase 4 optimistic UI):
 *
 *   toast.error(strings.board.optimistic.error, { description: ... })
 *     → mutation failed (`onMutationError`); destructive copy.
 *   toast(strings.board.conflict.refreshed)
 *     → CONFLICT after rollback + refetch; neutral copy.
 *
 * Callers don't reach into `sonner` directly — they import `{ toast }` from
 * `@pusula/ui` so the import surface stays single-sourced.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={5000}
      {...props}
    />
  );
}

export { sonnerToast as toast };
export type { ToasterProps };
